from datetime import date

from pydantic import BaseModel, HttpUrl


class TripCreate(BaseModel):
    title: str
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    visibility: str = "private"
    cover_colour: str | None = None


class TripUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    visibility: str | None = None
    cover_colour: str | None = None


class PlaceSummaryResponse(BaseModel):
    id: int
    name: str
    name_pt: str | None
    place_type: str
    country_code: str | None
    region_name: str | None
    centroid_lng: float | None = None
    centroid_lat: float | None = None
    geometry_geojson: dict | None = None

    model_config = {"from_attributes": True}


class TripCompanionResponse(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: str
    avatar_url: str | None
    status: str

    model_config = {"from_attributes": True}


class MediaLinkCreate(BaseModel):
    url: str


class MediaLinkResponse(BaseModel):
    id: int
    url: str
    og_title: str | None
    og_description: str | None
    og_image_url: str | None
    og_site_name: str | None

    model_config = {"from_attributes": True}


class SharedUserResponse(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: str
    avatar_url: str | None

    model_config = {"from_attributes": True}


class TripResponse(BaseModel):
    id: int
    title: str
    description: str | None
    start_date: date | None
    end_date: date | None
    cover_image_url: str | None
    cover_image_generating: bool
    cover_colour: str | None
    visibility: str
    sharing_token: str | None
    creator_id: int
    creator_username: str
    creator_display_name: str
    companions: list[TripCompanionResponse] = []
    place_count: int = 0

    model_config = {"from_attributes": True}


class TripDetailResponse(TripResponse):
    media_links: list[MediaLinkResponse] = []
    places: list[PlaceSummaryResponse] = []
    shared_with: list[SharedUserResponse] = []
