from sqlalchemy import Column, Integer, String, Float, UniqueConstraint, Index, JSON, Enum
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.base import TimestampMixin
from app.models.enums import PlaceType


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
