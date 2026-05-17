import asyncio
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import require_admin
from app.core.redis import get_redis
from app.models.place import Place
from app.models.project import Project
from app.models.settings import SiteSettings
from app.models.trip import Trip
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


class SiteSettingsResponse(BaseModel):
    allow_public_profiles_without_auth: bool

    model_config = {"from_attributes": True}


class SiteSettingsUpdate(BaseModel):
    allow_public_profiles_without_auth: bool | None = None


async def _get_or_create_settings(db: AsyncSession) -> SiteSettings:
    row = await db.get(SiteSettings, 1)
    if row is None:
        row = SiteSettings(id=1, allow_public_profiles_without_auth=True)
        db.add(row)
        await db.flush()
    return row


@router.get("/stats")
async def get_stats(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    # Single round-trip: four scalar subqueries in one SELECT
    row = await db.execute(
        select(
            select(func.count(User.id)).scalar_subquery().label("users"),
            select(func.count(Trip.id)).scalar_subquery().label("trips"),
            select(func.count(Project.id)).scalar_subquery().label("projects"),
            select(func.count(Place.id)).scalar_subquery().label("unique_places"),
        )
    )
    r = row.one()
    return {"users": r.users, "trips": r.trips, "projects": r.projects, "unique_places": r.unique_places}


@router.get("/health")
async def health_check(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    db_ok = False
    redis_ok = False

    try:
        await db.execute(select(func.now()))
        db_ok = True
    except Exception:
        pass

    try:
        redis = await get_redis()
        await redis.ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "database": "ok" if db_ok else "error",
        "redis": "ok" if redis_ok else "error",
    }


@router.get("/debug/celery-status")
async def celery_debug_status(_admin=Depends(require_admin)):
    from app.workers.celery_app import celery_app
    from app.core.config import get_settings

    settings = get_settings()

    # Ping Redis
    redis_ok = False
    redis_error = None
    try:
        redis = await get_redis()
        await redis.ping()
        redis_ok = True
    except Exception as exc:
        redis_error = str(exc)

    # Registered tasks from the local task registry (no broker connection needed)
    registered_tasks = sorted(celery_app.tasks.keys())

    # Inspect active workers via broker (run in thread so it doesn't block the event loop)
    worker_ping: dict | None = None
    worker_error: str | None = None
    try:
        def _ping():
            inspect = celery_app.control.inspect(timeout=3.0)
            return inspect.ping()

        worker_ping = await asyncio.to_thread(_ping)
    except Exception as exc:
        worker_error = str(exc)

    worker_count = len(worker_ping) if worker_ping else 0
    masked_broker = re.sub(r"(:)[^@/]+(.*@)", r"\1***\2", settings.celery_broker_url)

    return {
        "redis": "ok" if redis_ok else f"error: {redis_error}",
        "broker_url": masked_broker,
        "registered_tasks": registered_tasks,
        "worker_count": worker_count,
        "workers": worker_ping or {},
        "worker_error": worker_error,
    }


@router.get("/settings", response_model=SiteSettingsResponse)
async def get_settings_endpoint(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    return await _get_or_create_settings(db)


@router.patch("/settings", response_model=SiteSettingsResponse)
async def update_settings_endpoint(
    data: SiteSettingsUpdate,
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    row = await _get_or_create_settings(db)
    if data.allow_public_profiles_without_auth is not None:
        row.allow_public_profiles_without_auth = data.allow_public_profiles_without_auth
    await db.flush()
    return row
