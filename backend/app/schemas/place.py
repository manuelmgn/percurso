from pydantic import BaseModel


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
    # Centroid as [lng, lat]
    centroid_lng: float | None
    centroid_lat: float | None
    has_polygon: bool

    model_config = {"from_attributes": True}


class PlaceSearchResult(BaseModel):
    osm_id: int
    osm_type: str
    name: str
    display_name: str
    place_type: str
    country_code: str | None
    centroid_lng: float
    centroid_lat: float


class NominatimMatchResult(BaseModel):
    query: str
    match: PlaceSearchResult | None
    confidence: float | None
    alternatives: list[PlaceSearchResult] = []
