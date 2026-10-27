from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum, Table, Date, DateTime
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import Visibility


trip_participants = Table(
    "trip_participants",
    Base.metadata,
    Column("trip_id", Integer, ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

trip_visible_users = Table(
    "trip_visible_users",
    Base.metadata,
    Column("trip_id", Integer, ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

trip_places = Table(
    "trip_places",
    Base.metadata,
    Column("trip_id", Integer, ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True),
    Column("place_id", Integer, ForeignKey("places.id", ondelete="CASCADE"), primary_key=True),
)


class Trip(Base, TimestampMixin):
    __tablename__ = "trips"

    title = Column(String(255), nullable=True)  # Optional; UI falls back to "Viagem <dates>"
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    notes = Column(Text, nullable=True)  # Sanitised HTML from WYSIWYG
    visibility = Column(Enum(Visibility), nullable=False, default=Visibility.ALL)
    creator_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    companions_text = Column(String(512), nullable=True)
    # Manual cover chosen from the trip's gallery. SQLite cannot add this
    # FK to an existing table (ALTER ADD COLUMN drops FK constraints), so on
    # legacy databases referential integrity is enforced in the service
    # layer instead: the photos router clears the cover when its photo is
    # deleted. Fresh databases get the real FK with ON DELETE SET NULL.
    cover_photo_id = Column(
        Integer,
        ForeignKey("photos.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    cover_photo = relationship("Photo", foreign_keys=[cover_photo_id])

    creator = relationship("User", back_populates="trips")
    participants = relationship("User", secondary=trip_participants, backref="participating_trips")
    visible_users = relationship("User", secondary=trip_visible_users, backref="visible_trips")
    places = relationship("TripPlace", back_populates="trip", cascade="all, delete-orphan")
    projects = relationship("TripProject", back_populates="trip", cascade="all, delete-orphan")


class TripPlace(Base):
    __tablename__ = "trip_place_relations"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = Column(DateTime(timezone=True), nullable=False)

    trip = relationship("Trip", back_populates="places")
    place = relationship("Place", back_populates="trips")


class TripProject(Base):
    __tablename__ = "trip_project_relations"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    trip = relationship("Trip", back_populates="projects")
    project = relationship("Project", back_populates="trips")
