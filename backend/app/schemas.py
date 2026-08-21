from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict

from app.models import UserRole, ThemePreference, PlaceType


class UserBase(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=2, max_length=64)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class UserPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class PasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


class UserPreferencesUpdate(BaseModel):
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    theme: Optional[ThemePreference] = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    avatar_url: Optional[str] = None
    role: UserRole
    is_active: bool
    timezone: str
    date_format: str
    theme: ThemePreference
    created_at: datetime
    updated_at: datetime


class SetupRequest(BaseModel):
    admin_username: str = Field(..., min_length=2, max_length=64)
    admin_password: str = Field(..., min_length=8, max_length=128)
    second_username: Optional[str] = Field(None, min_length=2, max_length=64)
    second_password: Optional[str] = Field(None, min_length=8, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class MeResponse(BaseModel):
    user: UserResponse
    csrf_token: str


class PublicStatus(BaseModel):
    setup_required: bool


# --- Place schemas ---

from app.models import PlaceType, Visibility, MapMode


class PlaceBase(BaseModel):
    name: str
    place_type: PlaceType
    hierarchy: Optional[dict] = None
    lat: float
    lon: float


class PlaceResponse(PlaceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    osm_type: str
    osm_id: int
    polygon: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class PlaceSearchResult(BaseModel):
    osm_type: str
    osm_id: int
    name: str
    place_type: PlaceType
    hierarchy: Optional[dict] = None
    lat: float
    lon: float
    is_cached: bool = False


# --- Project schemas ---

class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    visibility: Visibility = Visibility.ALL
    map_mode: MapMode = MapMode.AUTO


class ProjectCreate(ProjectBase):
    participant_ids: list[int] = Field(default_factory=list)
    visible_user_ids: list[int] = Field(default_factory=list)
    place_ids: list[int] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    visibility: Optional[Visibility] = None
    map_mode: Optional[MapMode] = None
    participant_ids: Optional[list[int]] = None
    visible_user_ids: Optional[list[int]] = None


class ProjectPlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    place_id: int
    place_name: str
    place_type: PlaceType
    place_hierarchy: Optional[dict] = None
    place_lat: float
    place_lon: float
    place_polygon: Optional[dict] = None
    is_visited: bool
    is_unmarked: bool = False
    visited_at: Optional[datetime] = None


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    creator_id: int
    creator_username: str
    participants: list[UserResponse] = Field(default_factory=list)
    visible_users: list[UserResponse] = Field(default_factory=list)
    places: list[ProjectPlaceResponse] = Field(default_factory=list)
    trips: list["TripListResponse"] = Field(default_factory=list)
    total_places: int = 0
    visited_places: int = 0
    progress_percent: float = 0.0
    is_completed: bool = False
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    visibility: Visibility
    creator_username: str
    total_places: int
    visited_places: int
    progress_percent: float
    is_completed: bool
    created_at: datetime
    updated_at: datetime


class BulkImportLine(BaseModel):
    line: str
    status: str  # resolved, ambiguous, not_found
    candidates: list[PlaceSearchResult] = Field(default_factory=list)
    selected: Optional[PlaceSearchResult] = None


class BulkImportRequest(BaseModel):
    lines: list[str]
    # Optional type hint: when set, the user asserts every line is a place of
    # this type and resolution only considers candidates of that type.
    place_type: Optional[PlaceType] = None


class BulkImportResponse(BaseModel):
    lines: list[BulkImportLine]


# --- Trip schemas ---

class TripBase(BaseModel):
    start_date: datetime
    end_date: Optional[datetime] = None
    notes: Optional[str] = None
    visibility: Visibility = Visibility.ALL
    companions_text: Optional[str] = None


class TripCreate(TripBase):
    place_ids: list[int] = Field(default_factory=list)
    project_ids: list[int] = Field(default_factory=list)
    participant_ids: list[int] = Field(default_factory=list)
    visible_user_ids: list[int] = Field(default_factory=list)


class TripUpdate(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    notes: Optional[str] = None
    visibility: Optional[Visibility] = None
    companions_text: Optional[str] = None
    place_ids: Optional[list[int]] = None
    project_ids: Optional[list[int]] = None
    participant_ids: Optional[list[int]] = None
    visible_user_ids: Optional[list[int]] = None


class TripPlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    place_id: int
    place_name: str
    place_type: PlaceType
    place_hierarchy: Optional[dict] = None
    place_lat: float
    place_lon: float


class TripResponse(TripBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    creator_id: int
    creator_username: str
    participants: list[UserResponse] = Field(default_factory=list)
    visible_users: list[UserResponse] = Field(default_factory=list)
    places: list[TripPlaceResponse] = Field(default_factory=list)
    projects: list[ProjectListResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TripListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    start_date: datetime
    end_date: datetime
    visibility: Visibility
    creator_username: str
    place_count: int
    project_count: int
    created_at: datetime
    updated_at: datetime


class TripDeleteWarning(BaseModel):
    affected_projects: list[ProjectListResponse] = Field(default_factory=list)


# Resolve the forward reference used by ProjectResponse.trips
ProjectResponse.model_rebuild()


# --- Activity schemas ---

class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_username: str
    action: str
    entity_type: str
    entity_id: int
    entity_name: str
    created_at: datetime


# --- Image schemas ---

class ImageUploadResponse(BaseModel):
    url: str
    width: int
    height: int


# --- Search schemas ---

class SearchResult(BaseModel):
    trips: list[TripListResponse] = Field(default_factory=list)
    projects: list[ProjectListResponse] = Field(default_factory=list)
    places: list[PlaceResponse] = Field(default_factory=list)


# --- Stats schemas ---

class StatsSummary(BaseModel):
    trip_count: int
    place_count: int
    active_projects: int
    completed_projects: int


class ProjectStat(BaseModel):
    project_id: int
    project_name: str
    progress_percent: float
    visited_places: int
    total_places: int


class PlaceRanking(BaseModel):
    place_id: int
    place_name: str
    place_type: PlaceType
    visit_count: int


class RegionStat(BaseModel):
    region: str
    count: int


class StatsResponse(BaseModel):
    summary: StatsSummary
    project_stats: list[ProjectStat]
    region_stats: list[RegionStat]
    most_visited: list[PlaceRanking]
