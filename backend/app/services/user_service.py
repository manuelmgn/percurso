from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.auth import hash_password, verify_password, needs_rehash
from app.models import User, UserRole
from app.schemas import UserCreate, UserUpdate, UserPasswordChange


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


def list_users(db: Session) -> list[User]:
    return db.query(User).order_by(User.username).all()
