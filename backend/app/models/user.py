from datetime import datetime, timedelta, timezone

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Enum
from sqlalchemy.orm import relationship, validates

from app.database import Base
from app.config import settings
from app.models.base import TimestampMixin
from app.models.enums import UserRole, ThemePreference


class User(Base, TimestampMixin):
    __tablename__ = "users"

    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(String(255), nullable=True)
    role = Column(Enum(UserRole), nullable=False, default=UserRole.USER)
    is_active = Column(Boolean, nullable=False, default=True)

    timezone = Column(String(64), nullable=False, default="Europe/Lisbon")
    date_format = Column(String(32), nullable=False, default="%d/%m/%Y")
    theme = Column(Enum(ThemePreference), nullable=False, default=ThemePreference.SYSTEM)

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    trips = relationship("Trip", back_populates="creator", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="creator", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="user", cascade="all, delete-orphan")
    milestones = relationship("Milestone", back_populates="user", cascade="all, delete-orphan")

    @validates("username")
    def validate_username(self, _, value: str) -> str:
        value = value.strip().lower()
        if not value or len(value) < 2 or len(value) > 64:
            raise ValueError("Username must be between 2 and 64 characters")
        if not value.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, underscores and hyphens")
        return value

    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="sessions")

    @classmethod
    def default_expiry(cls) -> datetime:
        return datetime.now(timezone.utc) + timedelta(days=settings.session_max_age_days)

    def _aware_expires_at(self) -> datetime:
        if self.expires_at.tzinfo is None:
            return self.expires_at.replace(tzinfo=timezone.utc)
        return self.expires_at.astimezone(timezone.utc)

    def is_expired(self) -> bool:
        return datetime.now(timezone.utc) > self._aware_expires_at()

    def extend(self):
        self.expires_at = self.default_expiry()
