from typing import TYPE_CHECKING

from geoalchemy2 import Geometry
from sqlalchemy import BigInteger, Enum, Float, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.trip import TripPlace
    from app.models.project import ProjectTargetPlace


class Place(Base, TimestampMixin):
    __tablename__ = "places"

    id: Mapped[int] = mapped_column(primary_key=True)

    # OSM reference
    osm_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    osm_type: Mapped[str] = mapped_column(
        Enum("node", "way", "relation", name="osm_type"), nullable=False
    )
    osm_class: Mapped[str | None] = mapped_column(String(50), nullable=True)
    addresstype: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Place metadata
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    name_pt: Mapped[str | None] = mapped_column(String(500), nullable=True)
    name_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    place_type: Mapped[str] = mapped_column(String(50), nullable=False, server_default="outro")
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True, index=True)
    region_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Float coordinates (pre-computed from centroid for efficient queries)
    centroid_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    centroid_lng: Mapped[float | None] = mapped_column(Float, nullable=True)

    # PostGIS geometry (centroid point always set; polygon geometry when available)
    geometry: Mapped[object] = mapped_column(
        Geometry(geometry_type="GEOMETRY", srid=4326), nullable=True
    )
    centroid: Mapped[object] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )

    # GeoJSON polygon stored as JSONB for direct MapLibre consumption
    geometry_geojson: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Wikipedia cache
    wikipedia_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    wikipedia_language: Mapped[str | None] = mapped_column(String(5), nullable=True)
    wikipedia_title: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Relationships
    trip_places: Mapped[list["TripPlace"]] = relationship("TripPlace", back_populates="place")
    project_target_places: Mapped[list["ProjectTargetPlace"]] = relationship(
        "ProjectTargetPlace", back_populates="place"
    )
