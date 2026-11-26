from sqlalchemy import Column, Integer, String, Float, ForeignKey, UniqueConstraint, Index, JSON, Enum
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import PlaceType, PlaceRelationKind


class Place(Base, TimestampMixin):
    __tablename__ = "places"

    osm_type = Column(String(16), nullable=False)  # node, way, relation
    osm_id = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False, index=True)
    place_type = Column(Enum(PlaceType), nullable=False, default=PlaceType.OTHER)
    hierarchy = Column(JSON, nullable=True)  # {country, region, province, municipality, ...}
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    polygon = Column(JSON, nullable=True)  # simplified GeoJSON

    projects = relationship("ProjectPlace", back_populates="place")
    trips = relationship("TripPlace", back_populates="place")

    __table_args__ = (
        UniqueConstraint("osm_type", "osm_id", name="uq_place_osm"),
        Index("ix_place_name_type", "name", "place_type"),
    )


class UserPlace(Base, TimestampMixin):
    """Per-user personal mark on a place (residence or frequent visits) with an
    optional approximate year or year range.

    Year semantics:
    - year_from=None, year_to=None  -> no dates recorded
    - year_from=Y,    year_to=Y     -> single approximate year (Y)
    - year_from=Y1,   year_to=Y2    -> range (Y1–Y2)
    - year_from=Y,    year_to=None  -> ongoing since Y
    - year_from=None, year_to=Y     -> until Y
    """

    __tablename__ = "user_places"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(Enum(PlaceRelationKind), nullable=False)
    year_from = Column(Integer, nullable=True)
    year_to = Column(Integer, nullable=True)

    user = relationship("User", back_populates="place_relations")
    place = relationship("Place")

    __table_args__ = (
        UniqueConstraint("user_id", "place_id", name="uq_user_place"),
    )
