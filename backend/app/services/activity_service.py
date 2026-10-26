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

    # Keep only the last MAX_ACTIVITIES: one DELETE with a subquery instead
    # of counting + loading and deleting rows one by one.
    prunable = (
        db.query(Activity.id)
        .order_by(Activity.created_at.desc(), Activity.id.desc())
        .offset(MAX_ACTIVITIES)
    )
    db.query(Activity).filter(
        Activity.id.in_(row[0] for row in prunable)
    ).delete(synchronize_session=False)
    db.commit()

    return activity


def list_activities(db: Session, limit: int = 50) -> list[Activity]:
    return db.query(Activity).order_by(Activity.created_at.desc()).limit(limit).all()
