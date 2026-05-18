from fastapi import APIRouter, Depends
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
from app.models.activity import ActivityEvent
from app.models.user import User

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("")
async def list_activity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    # Fetch events from users who share trips/projects with the current user,
    # excluding the current user's own actions.
    result = await db.execute(
        select(ActivityEvent)
        .where(
            ActivityEvent.actor_id != current_user.id,
            text("""
                (
                    (activity_events.entity_type = 'trip' AND activity_events.entity_id IN (
                        SELECT tc.trip_id FROM trip_companions tc
                        WHERE tc.user_id = :uid AND tc.status = 'accepted'
                        UNION
                        SELECT t.id FROM trips t WHERE t.creator_id = :uid
                    ))
                    OR
                    (activity_events.entity_type = 'project' AND activity_events.entity_id IN (
                        SELECT pc.project_id FROM project_collaborators pc
                        WHERE pc.user_id = :uid AND pc.status = 'accepted'
                        UNION
                        SELECT p.id FROM projects p WHERE p.creator_id = :uid
                    ))
                )
            """).bindparams(uid=current_user.id),
        )
        .order_by(ActivityEvent.created_at.desc())
        .limit(50)
    )
    events = result.scalars().all()

    # Load actors in one query to avoid N+1.
    actor_ids = list({e.actor_id for e in events})
    actors: dict[int, User] = {}
    if actor_ids:
        actor_rows = await db.execute(select(User).where(User.id.in_(actor_ids)))
        for u in actor_rows.scalars().all():
            actors[u.id] = u

    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "entity_type": e.entity_type,
            "entity_id": e.entity_id,
            "entity_name": e.entity_name,
            "secondary_name": e.secondary_name,
            "created_at": e.created_at,
            "actor": (
                {
                    "id": actors[e.actor_id].id,
                    "username": actors[e.actor_id].username,
                    "display_name": actors[e.actor_id].display_name,
                    "avatar_url": actors[e.actor_id].avatar_url,
                }
                if e.actor_id in actors
                else None
            ),
        }
        for e in events
    ]
