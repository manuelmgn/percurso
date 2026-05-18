from datetime import date
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

_VISIBILITY = Literal["public", "private", "link", "users"]


class TripCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=10000)
    start_date: date | None = None
    end_date: date | None = None
    visibility: _VISIBILITY = "private"
    cover_colour: str | None = Field(None, max_length=7)


class TripUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=10000)
    start_date: date | None = None
    end_date: date | None = None
    visibility: _VISIBILITY | None = None
    cover_colour: str | None = Field(None, max_length=7)


class SharedUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)


class PlaceSummaryResponse(BaseModel):
    id: int
    osm_id: int
    osm_type: str
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
    url: str = Field(max_length=2000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        p = urlparse(v)
        if p.scheme not in ("http", "https") or not p.netloc:
            raise ValueError("URL deve começar com http:// ou https://")
        return v


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
    is_pinned: bool = False

    model_config = {"from_attributes": True}


class AssociatedProjectResponse(BaseModel):
    id: int
    title: str
    cover_colour: str | None
    cover_image_url: str | None


class TripDetailResponse(TripResponse):
    media_links: list[MediaLinkResponse] = []
    places: list[PlaceSummaryResponse] = []
    shared_with: list[SharedUserResponse] = []
    associated_projects: list[AssociatedProjectResponse] = []
