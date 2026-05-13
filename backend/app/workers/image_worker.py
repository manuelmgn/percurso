import asyncio
import re

import httpx

from app.workers.celery_app import celery_app

POLLINATIONS_URL = "https://image.pollinations.ai/prompt/{prompt}"


def _build_prompt(title: str, description: str | None) -> str:
    words = re.sub(r"[^\w\sÀ-ÿ]", "", title)
    subject = " ".join(words.split()[:5])
    return (
        f"simple flat design icon of {subject}, "
        "minimal style, solid pastel background, no text, "
        "clean vector look, icon illustration"
    )


async def _fetch_pollinations_image(prompt: str) -> bytes | None:
    encoded = prompt.replace(" ", "%20")
    url = POLLINATIONS_URL.format(prompt=encoded)
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                return resp.content
    except httpx.HTTPError:
        pass
    return None


async def _run_generation(entity_id: int, entity_type: str, title: str, description: str | None) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.core.config import get_settings

    settings = get_settings()
    prompt = _build_prompt(title, description)
    image_bytes = await _fetch_pollinations_image(prompt)

    if not image_bytes:
        engine = create_async_engine(settings.database_url)
        async_session = async_sessionmaker(engine, expire_on_commit=False)
        async with async_session() as db:
            if entity_type == "trip":
                from app.models.trip import Trip
                entity = await db.get(Trip, entity_id)
            else:
                from app.models.project import Project
                entity = await db.get(Project, entity_id)
            if entity:
                entity.cover_image_generating = False
                await db.commit()
        await engine.dispose()
        return

    from app.services.storage_service import upload_bytes_as_image
    url = await upload_bytes_as_image(
        user_id=0,
        entity_type=entity_type,  # type: ignore
        entity_id=entity_id,
        image_bytes=image_bytes,
        filename="ai_cover.jpg",
        content_type="image/jpeg",
    )

    engine = create_async_engine(settings.database_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    async with async_session() as db:
        if entity_type == "trip":
            from app.models.trip import Trip
            entity = await db.get(Trip, entity_id)
        else:
            from app.models.project import Project
            entity = await db.get(Project, entity_id)
        if entity:
            entity.cover_image_url = url
            entity.cover_image_generating = False
            await db.commit()
    await engine.dispose()


@celery_app.task(name="generate_cover_image", bind=True, max_retries=2)
def generate_cover_image_task(
    self,
    entity_id: int,
    entity_type: str,
    title: str,
    description: str | None = None,
) -> None:
    try:
        asyncio.run(_run_generation(entity_id, entity_type, title, description))
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
