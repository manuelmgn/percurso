from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum, JSON, Table, Date, DateTime
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
    # Up to 3 external links (Google Photos / Immich albums or generic URLs),
    # stored as [{url, type}]; the type is detected when the trip is saved.
    external_links = Column(JSON, nullable=True)
    # Optional linked Immich album UUID (used to render an inline gallery
    # proxied through the backend without storing photos locally).
    immich_album_id = Column(String(64), nullable=True)
    # User who linked `immich_album_id`; their Immich API key is used to proxy
    # ONLY the assets belonging to this album to authorised viewers of the trip.
    immich_owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Optional Immich asset UUID used as the trip cover (mutually exclusive
    # with cover_photo_id; proxied through /api/immich/trips/{id}/assets/{aid}/thumbnail).
    cover_immich_asset_id = Column(String(64), nullable=True)
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

    creator = relationship("User", back_populates="trips", foreign_keys=[creator_id])
    immich_owner = relationship("User", foreign_keys=[immich_owner_id])
    participants = relationship("User", secondary=trip_participants, backref="participating_trips")
    visible_users = relationship("User", secondary=trip_visible_users, backref="visible_trips")
    # Stops in itinerary order (manual order chosen by the user).
    places = relationship(
        "TripPlace",
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="(TripPlace.position, TripPlace.id)",
    )
    projects = relationship("TripProject", back_populates="trip", cascade="all, delete-orphan")


class TripPlace(Base):
    __tablename__ = "trip_place_relations"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False, index=True)
    added_at = Column(DateTime(timezone=True), nullable=False)
    # Itinerary order within the trip (0-based). Nullable only for rows
    # predating the column; the lightweight migration backfills them.
    position = Column(Integer, nullable=True)
    # Optional days the place was visited: sorted ISO dates ("YYYY-MM-DD")
    # inside the trip's date range. Empty/NULL = day not recorded.
    visit_dates = Column(JSON, nullable=True)

    trip = relationship("Trip", back_populates="places")
    place = relationship("Place", back_populates="trips")


class TripProject(Base):
    __tablename__ = "trip_project_relations"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)

    trip = relationship("Trip", back_populates="projects")
    project = relationship("Project", back_populates="trips")
