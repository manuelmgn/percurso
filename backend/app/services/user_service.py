from datetime import datetime, timezone
import logging
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password, needs_rehash
from app.config import settings
from app.models import User, UserRole, Trip, Photo, Pin, EntityType
from app.schemas import UserCreate, UserUpdate, UserPasswordChange

logger = logging.getLogger(__name__)


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    return db.query(User).filter(User.username == username.strip().lower()).first()


def create_user(db: Session, data: UserCreate) -> User:
    user = User(
        username=data.username.strip().lower(),
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user: User, data: UserUpdate) -> User:
    if data.username is not None:
        user.username = data.username.strip().lower()
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, data: UserPasswordChange) -> bool:
    if not verify_password(data.current_password, user.password_hash):
        return False
    user.password_hash = hash_password(data.new_password)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    return True


def reset_password(db: Session, user: User, new_password: str) -> User:
    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def check_and_update_password_hash(db: Session, user: User, password: str) -> User:
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.commit()
        db.refresh(user)
    return user


def has_users(db: Session) -> bool:
    return db.query(User).first() is not None


def seed_default_admin(db: Session) -> Optional[User]:
    """Create the default admin account on first launch (empty database).

    Idempotent: does nothing if any user already exists. The password comes
    from settings so it can be overridden via environment variables. The
    default credentials are intentionally weak — they must be changed after
    the first login. Built directly instead of via UserCreate because the
    default password is shorter than the API's minimum length.
    """
    if has_users(db):
        return None
    user = User(
        username=settings.default_admin_username,
        password_hash=hash_password(settings.default_admin_password),
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.warning(
        "Default admin '%s' created — change the password after the first login",
        user.username,
    )
    return user


def list_users(db: Session) -> list[User]:
    return db.query(User).order_by(User.username).all()


def list_active_users(db: Session) -> list[User]:
    return db.query(User).filter(User.is_active == True).order_by(User.username).all()


def delete_user_account(db: Session, user: User) -> list[str]:
    """Delete the user and everything attached. ORM cascades cover sessions,
    trips, projects, activities and milestones; DB-level FK cascades cover
    notifications, pins and the secondary association rows. Photo rows have
    no delete cascade, so they are removed explicitly — otherwise the flush
    would try to nullify their non-nullable trip_id/uploader_id and fail.

    Returns the upload URLs whose files must be unlinked AFTER this call's
    commit (same rule as trip_service.delete_trip: a failed commit must not
    leave rows pointing at deleted files)."""
    trip_ids = [t.id for t in user.trips]
    project_ids = [p.id for p in user.projects]
    photo_filter = Photo.uploader_id == user.id
    if trip_ids:
        photo_filter = or_(photo_filter, Photo.trip_id.in_(trip_ids))
    photos = db.query(Photo).filter(photo_filter).all()
    urls = [p.url for p in photos]
    if user.avatar_url:
        urls.append(user.avatar_url)

    # Logical SET NULL for covers pointing at the photos being deleted (the
    # cover FK only exists on fresh databases; legacy SQLite got the column
    # without it). This also covers photos the user uploaded to other
    # people's trips.
    photo_ids = [p.id for p in photos]
    if photo_ids:
        db.query(Trip).filter(Trip.cover_photo_id.in_(photo_ids)).update(
            {Trip.cover_photo_id: None}, synchronize_session=False
        )
    for photo in photos:
        db.delete(photo)
    db.flush()

    # Pins carry a plain entity id with no FK: pins belonging to OTHER users
    # that point at this user's trips/projects would dangle otherwise.
    if trip_ids:
        db.query(Pin).filter(Pin.entity_type == EntityType.TRIP, Pin.entity_id.in_(trip_ids)).delete(
            synchronize_session=False
        )
    if project_ids:
        db.query(Pin).filter(Pin.entity_type == EntityType.PROJECT, Pin.entity_id.in_(project_ids)).delete(
            synchronize_session=False
        )

    db.delete(user)
    db.commit()
    return urls
