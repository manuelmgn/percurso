from sqlalchemy.orm import Session

from app.models import Notification, User
from app.services import push_service

# pt-PT push bodies; the in-app list renders its own text via i18n.
_PUSH_BODIES = {
    "trip_created": "{actor} adicionou-te a uma viagem",
    "trip_updated": "{actor} editou uma viagem em que participas",
    "project_created": "{actor} adicionou-te a um projeto",
    "project_updated": "{actor} editou um projeto em que participas",
}


def notify_participants(
    db: Session,
    actor: User,
    *,
    notif_type: str,
    entity_type: str,
    entity_id: int,
    entity_name: str,
    participant_ids: list[int],
) -> None:
    """Create an in-app notification (and push) for each participant except the actor."""
    url = f"/{entity_type}s/{entity_id}"
    body_template = _PUSH_BODIES.get(notif_type, "{actor} fez uma alteração")
    for user_id in set(participant_ids):
        if user_id == actor.id:
            continue
        user = db.get(User, user_id)
        if user is None:
            continue
        notification = Notification(
            user_id=user.id,
            actor_id=actor.id,
            type=notif_type,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
        )
        db.add(notification)
        db.flush()
        push_service.send_to_user(
            db,
            user,
            {
                "title": "Percurso",
                "body": body_template.format(actor=actor.username),
                "icon": "/images/percurso-icono.svg",
                "url": url,
            },
        )


def list_notifications(db: Session, user: User, limit: int = 50) -> dict:
    rows = (
        db.query(Notification, User.username)
        .join(User, User.id == Notification.actor_id)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .all()
    )
    notifications = [
        {
            "id": n.id,
            "actor_username": username,
            "type": n.type,
            "entity_type": n.entity_type,
            "entity_id": n.entity_id,
            "entity_name": n.entity_name,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n, username in rows
    ]
    return {"notifications": notifications, "unread_count": unread_count(db, user)}


def unread_count(db: Session, user: User) -> int:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.is_read.is_(False))
        .count()
    )


def mark_read(db: Session, user: User, ids: list[int] | None) -> int:
    """Mark notifications as read (all of them when ids is None)."""
    query = db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read.is_(False))
    if ids is not None:
        query = query.filter(Notification.id.in_(ids))
    query.update({"is_read": True}, synchronize_session=False)
    db.commit()
    return unread_count(db, user)
