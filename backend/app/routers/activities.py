from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Trip, Project, EntityType
from app.schemas import ActivityResponse
from app.services import activity_service, visibility_service

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("/", response_model=list[ActivityResponse])
def list_activities(
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    activities = activity_service.list_activities(db, limit=50)

    visible = []
    for a in activities:
        # Hide actions on trips/projects the current user cannot see.
        # When the entity no longer exists the activity is a deletion record;
        # the name is kept (it was visible to someone at the time).
        if a.entity_type == EntityType.TRIP:
            trip = db.get(Trip, a.entity_id)
            if trip is not None and not visibility_service.can_user_see_trip(db, user, trip):
                continue
        elif a.entity_type == EntityType.PROJECT:
            project = db.get(Project, a.entity_id)
            if project is not None and not visibility_service.can_user_see_project(db, user, project):
                continue
        visible.append(a)
        if len(visible) >= limit:
            break

    return [
        ActivityResponse(
            id=a.id,
            user_id=a.user_id,
            user_username=a.user.username,
            action=a.action.value,
            entity_type=a.entity_type.value,
            entity_id=a.entity_id,
            entity_name=a.entity_name,
            created_at=a.created_at,
        )
        for a in visible
    ]
