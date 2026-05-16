from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.place import Place
    from app.models.trip import TripProject


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_image_delete_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_image_generating: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cover_colour: Mapped[str | None] = mapped_column(String(7), nullable=True)

    visibility: Mapped[str] = mapped_column(
        Enum("public", "private", "link", "users", name="visibility_level"),
        nullable=False,
        default="private",
    )
    sharing_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)

    creator: Mapped["User"] = relationship("User", back_populates="projects", foreign_keys=[creator_id])
    collaborators: Mapped[list["ProjectCollaborator"]] = relationship("ProjectCollaborator", back_populates="project", cascade="all, delete-orphan")
    target_places: Mapped[list["ProjectTargetPlace"]] = relationship("ProjectTargetPlace", back_populates="project", cascade="all, delete-orphan")
    shared_with: Mapped[list["ProjectSharedUser"]] = relationship("ProjectSharedUser", back_populates="project", cascade="all, delete-orphan")
    media_links: Mapped[list["ProjectMediaLink"]] = relationship("ProjectMediaLink", back_populates="project", cascade="all, delete-orphan")
    trip_associations: Mapped[list["TripProject"]] = relationship("TripProject", back_populates="project", cascade="all, delete-orphan")
    direct_visits: Mapped[list["ProjectDirectVisit"]] = relationship("ProjectDirectVisit", back_populates="project", cascade="all, delete-orphan")


class ProjectCollaborator(Base, TimestampMixin):
    __tablename__ = "project_collaborators"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "declined", name="invite_status"),
        nullable=False,
        default="pending",
    )
    hide_from_profile: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    project: Mapped["Project"] = relationship("Project", back_populates="collaborators")
    user: Mapped["User"] = relationship("User", back_populates="project_collaborators")


class ProjectTargetPlace(Base, TimestampMixin):
    __tablename__ = "project_target_places"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="target_places")
    place: Mapped["Place"] = relationship("Place", back_populates="project_target_places")


class ProjectSharedUser(Base):
    __tablename__ = "project_shared_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    project: Mapped["Project"] = relationship("Project", back_populates="shared_with")
    user: Mapped["User"] = relationship("User")


class ProjectDirectVisit(Base, TimestampMixin):
    __tablename__ = "project_direct_visits"
    __table_args__ = (UniqueConstraint("project_id", "place_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), nullable=False, index=True)
    marked_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    project: Mapped["Project"] = relationship("Project", back_populates="direct_visits")


class ProjectMediaLink(Base, TimestampMixin):
    __tablename__ = "project_media_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    og_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    og_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    og_site_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="media_links")
