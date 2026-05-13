from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import require_admin
from app.core.redis import get_redis
from app.models.place import Place
from app.models.project import Project
from app.models.trip import Trip
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(
    _admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    user_count = (await db.execute(select(func.count(User.id)))).scalar()
    trip_count = (await db.execute(select(func.count(Trip.id)))).scalar()
    project_count = (await db.execute(select(func.count(Project.id)))).scalar()
    place_count = (await db.execute(select(func.count(Place.id)))).scalar()

    return {
        "users": user_count,
        "trips": trip_count,
        "projects": project_count,
        "unique_places": place_count,
    }


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
