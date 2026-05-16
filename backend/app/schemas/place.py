from datetime import date
from typing import Any

from pydantic import BaseModel


class TripDateSummary(BaseModel):
    id: int
    title: str
    start_date: date | None
    end_date: date | None


class PlaceResponse(BaseModel):
    id: int
    osm_id: int
    osm_type: str
    name: str
    name_pt: str | None
    place_type: str
    country_code: str | None
    region_name: str | None
    wikipedia_summary: str | None
    wikipedia_language: str | None
    wikipedia_title: str | None
    centroid_lng: float | None
    centroid_lat: float | None
    has_polygon: bool
    geometry_geojson: dict[str, Any] | None = None
    place_trips: list[TripDateSummary] = []

    model_config = {"from_attributes": True}


class PlaceSearchResult(BaseModel):
    osm_id: int
    osm_type: str
    osm_class: str
    name: str
    display_name: str
    place_type: str
    place_type_label: str
    place_category: str
    country_code: str | None
    centroid_lng: float
    centroid_lat: float
    importance: float | None
    addresstype: str
    admin_level: int | None


class NominatimMatchResult(BaseModel):
    query: str
    match: PlaceSearchResult | None
    confidence: float | None
    alternatives: list[PlaceSearchResult] = []


class TripLinkResponse(BaseModel):
    id: int
    title: str


class VisitedPlaceResponse(PlaceResponse):
    visit_count: int = 0
    first_visited: date | None = None
    trips: list[TripLinkResponse] = []
