from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import User, Activity, EntityAction, EntityType

MAX_ACTIVITIES = 50


def log_activity(
    db: Session,
    user: User,
    action: EntityAction,
    entity_type: EntityType,
    entity_id: int,
    entity_name: str,
) -> Activity:
    activity = Activity(
        user_id=user.id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)

    # Keep only the last MAX_ACTIVITIES
    count = db.query(Activity).count()
    if count > MAX_ACTIVITIES:
        oldest = db.query(Activity).order_by(Activity.created_at).limit(count - MAX_ACTIVITIES).all()
        for old in oldest:
            db.delete(old)
        db.commit()

    return activity


def list_activities(db: Session, limit: int = 50) -> list[Activity]:
    return db.query(Activity).order_by(Activity.created_at.desc()).limit(limit).all()
