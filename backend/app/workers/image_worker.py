import base64
import logging

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.workers.celery_app import celery_app
from app.models.user import User  # noqa: F401
from app.models.place import Place  # noqa: F401
from app.models.trip import Trip
from app.models.project import Project
from app.models.notification import Notification

logger = logging.getLogger(__name__)

POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"
_IMGBB_URL = "https://api.imgbb.com/1/upload"

_HAIKU_SYSTEM = (
    "You are helping generate a travel poster icon image. "
    "From the title and description, return a SHORT visual scene description "
    "in English that captures BOTH the place and the activity (if any).\n\n"
    "Rules:\n"
    "- Maximum 6 words\n"
    "- Describe a SCENE or MOOD, not just an object\n"
    "- Include the activity type generically (do not name specific bars, "
    "restaurants, etc.)\n"
    "- Reference the place by its architectural or landscape CHARACTER, "
    "not necessarily by name\n"
    "- Never use people's names, brand names, or specific business names\n\n"
    "Examples:\n"
    "- 'Bares por Santiago de Compostela' → "
    "'medieval stone city bar crawl'\n"
    "- 'Trilho das Aldeias do Xisto' → "
    "'slate mountain village hiking trail'\n"
    "- 'Gastronomia no Porto' → "
    "'riverside granite city fine dining'\n"
    "- 'Comarcas de Galicia' → "
    "'green Galician countryside horreo granary'\n"
    "- 'Viagem ao Japão no inverno' → "
    "'snow Mount Fuji winter journey'\n"
    "- 'Praias do Algarve' → "
    "'golden limestone cliffs ocean beach'\n"
    "- 'Road trip pela Escócia' → "
    "'misty highland castle road trip'\n"
    "Return only the scene description. No punctuation. No explanation."
)

# Maps the entity's stored cover_colour hex to a pastel background name for the prompt.
_COLOUR_MAP: dict[str, str] = {
    "#7C3AED": "soft lavender",
    "#6D28D9": "soft lavender",
    "#7E22CE": "soft lavender",
    "#4F46E5": "pale sky blue",
    "#0369A1": "pale sky blue",
    "#0891B2": "soft teal",
    "#0D9488": "mint green",
    "#059669": "soft sage green",
    "#65A30D": "soft sage green",
    "#B45309": "warm peach",
    "#C2410C": "light coral",
    "#BE185D": "soft rose",
}

# Module-level engine and session factory, created once on first use.
_engine = None
_SessionLocal = None


def _get_session_factory():
    global _engine, _SessionLocal
    if _SessionLocal is None:
        from app.core.config import get_settings
        settings = get_settings()
        _engine = create_engine(settings.database_sync_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _SessionLocal


def _extract_visual_context(title: str, description: str | None, api_key: str) -> str:
    if not api_key:
        return title

    text = f"Title: {title}"
    if description:
        text += f"\nDescription: {description}"

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=60,
            system=_HAIKU_SYSTEM,
            messages=[{"role": "user", "content": text}],
        )
        result = message.content[0].text.strip()
        if result:
            return result
    except Exception as exc:
        logger.warning("Claude Haiku extraction failed, falling back to title: %s", exc)

    return title


def _build_prompt(visual_context: str, cover_colour: str | None = None) -> str:
    bg = _COLOUR_MAP.get((cover_colour or "").upper(), "soft lavender")
    # visual_context is "landmark, activity symbol" — join with "with" for the prompt.
    parts = [p.strip() for p in visual_context.split(",", 1)]
    if len(parts) == 2 and parts[0].lower() != parts[1].lower():
        subject = f"{parts[0]} with {parts[1]}"
    else:
        subject = parts[0]
    return (
        f"travel poster, {subject}, "
        f"flat vector illustration, bold graphic style, "
        f"solid {bg} background, centered, "
        "no people, no text, no photo realism, "
        "editorial poster art"
    )


def _fetch_pollinations_image(prompt: str) -> bytes | None:
    encoded = prompt.replace(" ", "%20").replace(",", "%2C")
    url = POLLINATIONS_URL.format(prompt=encoded)
    try:
        with httpx.Client(timeout=90.0, follow_redirects=True) as client:
            resp = client.get(url)
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                return resp.content
            logger.warning("Pollinations returned status %d for prompt: %s", resp.status_code, prompt)
    except httpx.HTTPError as exc:
        logger.warning("Pollinations HTTP error: %s", exc)
    return None


def _upload_to_imgbb(image_bytes: bytes, api_key: str) -> tuple[str, str]:
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                _IMGBB_URL,
                data={"key": api_key, "image": encoded, "name": "ai_cover"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.error("ImgBB request failed: %s", exc)
        raise RuntimeError("Não foi possível guardar a imagem.") from exc
    if not data.get("success"):
        raise RuntimeError("Não foi possível guardar a imagem.")
    return data["data"]["url"], data["data"]["delete_url"]


def _delete_from_imgbb(delete_url: str) -> None:
    try:
        with httpx.Client(timeout=10.0) as client:
            client.get(delete_url)
    except Exception as exc:
        logger.warning("ImgBB delete failed: %s", exc)


def _write_failure(entity_id: int, entity_type: str, title: str) -> None:
    entity_word = "viagem" if entity_type == "trip" else "projeto"
    SessionLocal = _get_session_factory()
    with SessionLocal() as session:
        entity = session.get(Trip if entity_type == "trip" else Project, entity_id)
        if entity:
            entity.cover_image_generating = False
            session.add(Notification(
                recipient_id=entity.creator_id,
                notification_type="cover_generation_failed",
                entity_type=entity_type,
                entity_id=entity_id,
                message=f"Não foi possível gerar a capa para {entity_word} «{title}»",
            ))
            session.commit()


def _run_generation(entity_id: int, entity_type: str, title: str, description: str | None) -> None:
    from app.core.config import get_settings
    settings = get_settings()

    # Read cover_colour before generation so the prompt background matches the entity's palette.
    SessionLocal = _get_session_factory()
    with SessionLocal() as session:
        _entity = session.get(Trip if entity_type == "trip" else Project, entity_id)
        cover_colour = _entity.cover_colour if _entity else None

    visual_context = _extract_visual_context(title, description, settings.anthropic_api_key)
    prompt = _build_prompt(visual_context, cover_colour)
    logger.info("Cover prompt for %s %d: %s", entity_type, entity_id, prompt)

    image_bytes = _fetch_pollinations_image(prompt)

    if not image_bytes:
        _write_failure(entity_id, entity_type, title)
        return

    try:
        url, delete_url = _upload_to_imgbb(image_bytes, settings.imgbb_api_key)
    except RuntimeError as exc:
        logger.error("ImgBB upload failed: %s", exc)
        _write_failure(entity_id, entity_type, title)
        return

    SessionLocal = _get_session_factory()
    with SessionLocal() as session:
        entity = session.get(Trip if entity_type == "trip" else Project, entity_id)

        if not entity:
            return

        old_delete_url = entity.cover_image_delete_url
        entity.cover_image_url = url
        entity.cover_image_delete_url = delete_url
        entity.cover_image_generating = False
        session.commit()

    if old_delete_url:
        _delete_from_imgbb(old_delete_url)


@celery_app.task(name="generate_cover_image", bind=True, max_retries=2)
def generate_cover_image_task(
    self,
    entity_id: int,
    entity_type: str,
    title: str,
    description: str | None = None,
) -> None:
    logger.info(f"TASK STARTED: {entity_type} {entity_id}")
    try:
        _run_generation(entity_id, entity_type, title, description)
    except Exception as exc:
        logger.exception(
            "Cover generation attempt %d/%d failed for %s %d",
            self.request.retries + 1, self.max_retries + 1, entity_type, entity_id,
        )
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)
        try:
            _write_failure(entity_id, entity_type, title)
        except Exception:
            logger.exception("Failed to record cover generation failure for %s %d", entity_type, entity_id)
