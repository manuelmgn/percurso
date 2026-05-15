import asyncio
import logging

import httpx

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"


async def _extract_visual_context(title: str, description: str | None, api_key: str) -> str:
    """Use Claude Haiku to extract a short visual-context phrase from title+description."""
    if not api_key:
        return title

    text = f"Title: {title}"
    if description:
        text += f"\nDescription: {description}"

    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=80,
            messages=[{
                "role": "user",
                "content": (
                    "Extract key visual elements from this travel title and description for a cover image prompt. "
                    "Reply with ONLY a short phrase (max 10 words) describing: location, season or time of year, "
                    "mode of transport if mentioned, and overall mood. "
                    "Example: 'Lisbon Portugal, sunny summer, tram, vibrant'.\n\n"
                    + text
                ),
            }],
        )
        result = message.content[0].text.strip()
        if result:
            return result
    except Exception as exc:
        logger.warning("Claude Haiku extraction failed, falling back to title: %s", exc)

    return title


def _build_prompt(visual_context: str) -> str:
    return (
        f"travel cover image, {visual_context}, "
        "simple flat illustration, clean composition, muted pastel colours, "
        "no text, no people's faces, 16:9 aspect ratio, thumbnail style"
    )


async def _fetch_pollinations_image(prompt: str) -> bytes | None:
    encoded = prompt.replace(" ", "%20").replace(",", "%2C")
    url = POLLINATIONS_URL.format(prompt=encoded)
    try:
        async with httpx.AsyncClient(timeout=90.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                return resp.content
            logger.warning("Pollinations returned status %d for prompt: %s", resp.status_code, prompt)
    except httpx.HTTPError as exc:
        logger.warning("Pollinations HTTP error: %s", exc)
    return None


async def _write_failure(entity_id: int, entity_type: str, session_factory, title: str) -> None:
    from app.models.notification import Notification
    entity_word = "viagem" if entity_type == "trip" else "projeto"
    async with session_factory() as db:
        if entity_type == "trip":
            from app.models.trip import Trip
            entity = await db.get(Trip, entity_id)
        else:
            from app.models.project import Project
            entity = await db.get(Project, entity_id)

        if entity:
            entity.cover_image_generating = False
            db.add(Notification(
                recipient_id=entity.creator_id,
                notification_type="cover_generation_failed",
                entity_type=entity_type,
                entity_id=entity_id,
                message=f"Não foi possível gerar a capa para {entity_word} «{title}»",
            ))
            await db.commit()


async def _run_generation(entity_id: int, entity_type: str, title: str, description: str | None) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import get_settings
    from app.services.storage_service import upload_to_imgbb, delete_from_imgbb

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        visual_context = await _extract_visual_context(title, description, settings.anthropic_api_key)
        prompt = _build_prompt(visual_context)
        logger.info("Cover prompt for %s %d: %s", entity_type, entity_id, prompt)

        image_bytes = await _fetch_pollinations_image(prompt)

        async with session_factory() as db:
            if entity_type == "trip":
                from app.models.trip import Trip
                entity = await db.get(Trip, entity_id)
            else:
                from app.models.project import Project
                entity = await db.get(Project, entity_id)

            if not entity:
                return

            if not image_bytes:
                entity.cover_image_generating = False
                from app.models.notification import Notification
                entity_word = "viagem" if entity_type == "trip" else "projeto"
                db.add(Notification(
                    recipient_id=entity.creator_id,
                    notification_type="cover_generation_failed",
                    entity_type=entity_type,
                    entity_id=entity_id,
                    message=f"Não foi possível gerar a capa para {entity_word} «{entity.title}»",
                ))
                await db.commit()
                return

            try:
                url, delete_url = await upload_to_imgbb(image_bytes, "ai_cover")
            except RuntimeError as exc:
                logger.error("ImgBB upload failed: %s", exc)
                entity.cover_image_generating = False
                from app.models.notification import Notification
                entity_word = "viagem" if entity_type == "trip" else "projeto"
                db.add(Notification(
                    recipient_id=entity.creator_id,
                    notification_type="cover_generation_failed",
                    entity_type=entity_type,
                    entity_id=entity_id,
                    message=f"Não foi possível gerar a capa para {entity_word} «{entity.title}»",
                ))
                await db.commit()
                return

            old_delete_url = entity.cover_image_delete_url
            entity.cover_image_url = url
            entity.cover_image_delete_url = delete_url
            entity.cover_image_generating = False
            await db.commit()

        if old_delete_url:
            await delete_from_imgbb(old_delete_url)

    finally:
        await engine.dispose()


@celery_app.task(name="generate_cover_image", bind=True, max_retries=2)
def generate_cover_image_task(
    self,
    entity_id: int,
    entity_type: str,
    title: str,
    description: str | None = None,
) -> None:
    logger.info(
        "generate_cover_image_task received: entity_type=%s entity_id=%d attempt=%d/%d",
        entity_type, entity_id, self.request.retries + 1, self.max_retries + 1,
    )
    try:
        asyncio.run(_run_generation(entity_id, entity_type, title, description))
    except Exception as exc:
        logger.exception(
            "Cover generation attempt %d/%d failed for %s %d",
            self.request.retries + 1, self.max_retries + 1, entity_type, entity_id,
        )
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=30)

        # All retries exhausted — mark failure in DB.
        async def _mark_failed() -> None:
            from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
            from app.core.config import get_settings
            from app.models.notification import Notification

            settings = get_settings()
            engine = create_async_engine(settings.database_url)
            session_factory = async_sessionmaker(engine, expire_on_commit=False)
            entity_word = "viagem" if entity_type == "trip" else "projeto"
            try:
                async with session_factory() as db:
                    if entity_type == "trip":
                        from app.models.trip import Trip
                        entity = await db.get(Trip, entity_id)
                    else:
                        from app.models.project import Project
                        entity = await db.get(Project, entity_id)
                    if entity:
                        entity.cover_image_generating = False
                        db.add(Notification(
                            recipient_id=entity.creator_id,
                            notification_type="cover_generation_failed",
                            entity_type=entity_type,
                            entity_id=entity_id,
                            message=f"Não foi possível gerar a capa para {entity_word} «{entity.title}»",
                        ))
                        await db.commit()
            finally:
                await engine.dispose()

        try:
            asyncio.run(_mark_failed())
        except Exception:
            logger.exception("Failed to record cover generation failure for %s %d", entity_type, entity_id)
