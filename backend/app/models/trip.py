from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.place import Place
    from app.models.project import Project


class Trip(Base, TimestampMixin):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(primary_key=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Cover image
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_image_delete_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cover_image_generating: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cover_colour: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # Privacy
    visibility: Mapped[str] = mapped_column(
        Enum("public", "private", "link", "users", name="visibility_level"),
        nullable=False,
        default="private",
    )
    sharing_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)

    # Relationships
    creator: Mapped["User"] = relationship("User", back_populates="trips", foreign_keys=[creator_id])
    companions: Mapped[list["TripCompanion"]] = relationship("TripCompanion", back_populates="trip", cascade="all, delete-orphan")
    places: Mapped[list["TripPlace"]] = relationship("TripPlace", back_populates="trip", cascade="all, delete-orphan", order_by="TripPlace.visit_order")
    media_links: Mapped[list["TripMediaLink"]] = relationship("TripMediaLink", back_populates="trip", cascade="all, delete-orphan")
    shared_with: Mapped[list["TripSharedUser"]] = relationship("TripSharedUser", back_populates="trip", cascade="all, delete-orphan")
    project_associations: Mapped[list["TripProject"]] = relationship("TripProject", back_populates="trip", cascade="all, delete-orphan")


class TripCompanion(Base, TimestampMixin):
    __tablename__ = "trip_companions"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    invite_token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "accepted", "declined", name="invite_status"),
        nullable=False,
        default="pending",
    )
    hide_from_profile: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships
    trip: Mapped["Trip"] = relationship("Trip", back_populates="companions")
    user: Mapped["User"] = relationship("User", back_populates="trip_companions")


class TripPlace(Base):
    __tablename__ = "trip_places"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), nullable=False, index=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id"), nullable=False, index=True)
    visit_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="places")
    place: Mapped["Place"] = relationship("Place", back_populates="trip_places")


class TripMediaLink(Base, TimestampMixin):
    __tablename__ = "trip_media_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    og_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    og_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    og_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    og_site_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="media_links")


class TripSharedUser(Base):
    __tablename__ = "trip_shared_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="shared_with")
    user: Mapped["User"] = relationship("User")


class TripProject(Base, TimestampMixin):
    __tablename__ = "trip_projects"
    __table_args__ = (UniqueConstraint("trip_id", "project_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="project_associations")
    project: Mapped["Project"] = relationship("Project", back_populates="trip_associations")
