from datetime import date
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator

_VISIBILITY = Literal["public", "private", "link", "users"]


class MediaLinkCreate(BaseModel):
    url: str = Field(max_length=2000)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        p = urlparse(v)
        if p.scheme not in ("http", "https") or not p.netloc:
            raise ValueError("URL deve começar com http:// ou https://")
        return v


class SharedUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)


class TripForPlaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=10000)


class MediaLinkResponse(BaseModel):
    id: int
    url: str
    og_title: str | None
    og_description: str | None
    og_image_url: str | None
    og_site_name: str | None

    model_config = {"from_attributes": True}


class TripSummaryForPlace(BaseModel):
    id: int
    title: str
    start_date: date | None


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
    visited: bool = False
    direct_visit: bool = False
    visit_trips: list[TripSummaryForPlace] = []

    model_config = {"from_attributes": True}


class AssociatedTripResponse(BaseModel):
    id: int
    title: str
    start_date: date | None
    end_date: date | None
    covered_place_ids: list[int] = []


class MissingMember(BaseModel):
    user_id: int
    display_name: str
    username: str


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(None, max_length=10000)
    goal_description: str | None = Field(None, max_length=10000)
    visibility: _VISIBILITY = "private"
    cover_colour: str | None = Field(None, max_length=7)


class ProjectUpdate(BaseModel):
    title: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=10000)
    goal_description: str | None = Field(None, max_length=10000)
    visibility: _VISIBILITY | None = None
    cover_colour: str | None = Field(None, max_length=7)


class ProjectCollaboratorResponse(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: str
    avatar_url: str | None
    status: str

    model_config = {"from_attributes": True}


class ProjectResponse(BaseModel):
    id: int
    title: str
    description: str | None
    goal_description: str | None
    cover_image_url: str | None
    cover_image_generating: bool
    cover_colour: str | None
    visibility: str
    sharing_token: str | None
    creator_id: int
    creator_username: str
    creator_display_name: str
    collaborators: list[ProjectCollaboratorResponse] = []
    target_place_count: int = 0
    visited_place_count: int = 0
    is_pinned: bool = False
    is_archived: bool = False

    model_config = {"from_attributes": True}


class SharedUserResponse(BaseModel):
    id: int
    user_id: int
    username: str
    display_name: str
    avatar_url: str | None

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    target_places: list[PlaceSummaryResponse] = []
    shared_with: list[SharedUserResponse] = []
    media_links: list[MediaLinkResponse] = []
    associated_trips: list[AssociatedTripResponse] = []
    new_trip_id: int | None = None


class PlaceImportLine(BaseModel):
    query: str


class PlaceImportRequest(BaseModel):
    lines: list[str]
