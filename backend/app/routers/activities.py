from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Trip, Project, EntityType
from app.schemas import ActivityResponse
from app.services import activity_service, visibility_service

router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("/", response_model=list[ActivityResponse])
def list_activities(
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    activities = activity_service.list_activities(db, limit=limit)

    trip_ids = {a.entity_id for a in activities if a.entity_type == EntityType.TRIP}
    project_ids = {a.entity_id for a in activities if a.entity_type == EntityType.PROJECT}
    user_ids = {a.user_id for a in activities}

    # Existence and visibility are resolved with aggregate IN queries (plus
    # the shared SQL visibility conditions) instead of a db.get() plus a
    # can_user_see_* check per row.
    existing_trip_ids = (
        {row[0] for row in db.query(Trip.id).filter(Trip.id.in_(trip_ids))} if trip_ids else set()
    )
    visible_trip_ids = (
        {
            row[0]
            for row in db.query(Trip.id).filter(
                Trip.id.in_(trip_ids), visibility_service._trip_is_visible_condition(user.id)
            )
        }
        if trip_ids
        else set()
    )
    existing_project_ids = (
        {row[0] for row in db.query(Project.id).filter(Project.id.in_(project_ids))} if project_ids else set()
    )
    visible_project_ids = (
        {
            row[0]
            for row in db.query(Project.id).filter(
                Project.id.in_(project_ids), visibility_service._project_is_visible_condition(user.id)
            )
        }
        if project_ids
        else set()
    )
    usernames = (
        {row.id: row.username for row in db.query(User.id, User.username).filter(User.id.in_(user_ids))}
        if user_ids
        else {}
    )

    visible = []
    for a in activities:
        if a.entity_type == EntityType.TRIP:
            existing, allowed = existing_trip_ids, visible_trip_ids
        elif a.entity_type == EntityType.PROJECT:
            existing, allowed = existing_project_ids, visible_project_ids
        else:
            existing, allowed = None, None
        if existing is not None:
            if a.entity_id not in existing:
                # The entity was deleted. The stored entity_name may belong
                # to a trip/project others never saw, so the record is only
                # kept for its own actor.
                if a.user_id != user.id:
                    continue
            elif a.entity_id not in allowed:
                continue
        visible.append(a)
        if len(visible) >= limit:
            break

    return [
        ActivityResponse(
            id=a.id,
            user_id=a.user_id,
            # "?" covers activities whose author account was deleted (the old
            # per-row lazy load would have crashed on None.username).
            user_username=usernames.get(a.user_id, "?"),
            action=a.action.value,
            entity_type=a.entity_type.value,
            entity_id=a.entity_id,
            entity_name=a.entity_name,
            created_at=a.created_at,
        )
        for a in visible
    ]
