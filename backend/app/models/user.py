from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.trip import Trip, TripCompanion
    from app.models.project import Project, ProjectCollaborator
    from app.models.notification import Notification


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    avatar_delete_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    visited_places_sharing_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    biography: Mapped[str | None] = mapped_column(Text, nullable=True)
    website_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("admin", "user", name="user_role"), nullable=False, default="user"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Per-user privacy defaults
    default_trip_visibility: Mapped[str] = mapped_column(
        Enum("public", "private", "link", "users", name="visibility_level"),
        nullable=False,
        default="private",
    )
    default_project_visibility: Mapped[str] = mapped_column(
        Enum("public", "private", "link", "users", name="visibility_level"),
        nullable=False,
        default="private",
    )
    visited_places_visibility: Mapped[str] = mapped_column(
        Enum("public", "private", "link", "users", name="visibility_level"),
        nullable=False,
        default="private",
    )

    # Relationships
    trips: Mapped[list["Trip"]] = relationship("Trip", back_populates="creator", foreign_keys="Trip.creator_id")
    trip_companions: Mapped[list["TripCompanion"]] = relationship("TripCompanion", back_populates="user")
    projects: Mapped[list["Project"]] = relationship("Project", back_populates="creator", foreign_keys="Project.creator_id")
    project_collaborators: Mapped[list["ProjectCollaborator"]] = relationship("ProjectCollaborator", back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="recipient",
        foreign_keys="[Notification.recipient_id]",
    )
