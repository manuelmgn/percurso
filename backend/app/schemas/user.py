from datetime import date
from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, EmailStr, Field, field_validator

_VISIBILITY = Literal["public", "private", "link", "users"]


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)
    role: Literal["admin", "user"] = "user"

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("O nome de utilizador só pode conter letras, números, _ e -")
        if len(v) < 3 or len(v) > 50:
            raise ValueError("O nome de utilizador deve ter entre 3 e 50 caracteres")
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A palavra-passe deve ter pelo menos 8 caracteres")
        return v


class UserUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=100)
    biography: str | None = None
    website_url: AnyHttpUrl | None = None
    default_trip_visibility: _VISIBILITY | None = None
    default_project_visibility: _VISIBILITY | None = None
    visited_places_visibility: _VISIBILITY | None = None

    @field_validator("website_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        if isinstance(v, str) and v.strip() == "":
            return None
        return v

    @field_validator("display_name")
    @classmethod
    def display_name_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 100:
            raise ValueError("O nome de apresentação não pode ter mais de 100 caracteres")
        return v

    @field_validator("biography")
    @classmethod
    def biography_length(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 500:
            raise ValueError("A biografia não pode ter mais de 500 caracteres")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    display_name: str
    avatar_url: str | None
    biography: str | None
    website_url: str | None
    role: str
    is_active: bool
    default_trip_visibility: str
    default_project_visibility: str
    visited_places_visibility: str
    visited_places_sharing_token: str | None = None

    model_config = {"from_attributes": True}


class UserPublicResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None
    biography: str | None
    website_url: str | None

    model_config = {"from_attributes": True}


class TripPublicSummary(BaseModel):
    id: int
    title: str
    start_date: date | None
    end_date: date | None
    cover_image_url: str | None
    cover_colour: str | None
    place_count: int
    is_pinned: bool = False


class ProjectPublicSummary(BaseModel):
    id: int
    title: str
    cover_image_url: str | None
    cover_colour: str | None
    target_place_count: int
    visited_place_count: int
    is_pinned: bool = False
    is_archived: bool = False


class VisitedPlacePublic(BaseModel):
    id: int
    name: str
    name_pt: str | None
    place_type: str
    country_code: str | None
    region_name: str | None
    centroid_lng: float | None = None
    centroid_lat: float | None = None
    geometry_geojson: dict | None = None


class ProfileStats(BaseModel):
    total_places: int
    total_countries: int
    avg_project_completion: float


class UserProfileResponse(UserPublicResponse):
    # Trips section (only present if trip visibility is public)
    pinned_trips: list[TripPublicSummary] = []
    recent_trips: list[TripPublicSummary] = []
    total_public_trip_count: int = 0
    # Projects section (only present if project visibility is public)
    pinned_projects: list[ProjectPublicSummary] = []
    active_projects: list[ProjectPublicSummary] = []
    total_public_project_count: int = 0
    # Stats + visited places (only present if visited_places_visibility is public)
    stats: ProfileStats | None = None
    visited_place_count: int | None = None
    visited_places: list[VisitedPlacePublic] = []


class PasswordReset(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A palavra-passe deve ter pelo menos 8 caracteres")
        return v


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A palavra-passe deve ter pelo menos 8 caracteres")
        return v
