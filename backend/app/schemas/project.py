from pydantic import BaseModel


class PlaceSummaryResponse(BaseModel):
    id: int
    name: str
    name_pt: str | None
    place_type: str
    country_code: str | None
    region_name: str | None

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    title: str
    description: str | None = None
    goal_description: str | None = None
    visibility: str = "private"
    cover_colour: str | None = None


class ProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    goal_description: str | None = None
    visibility: str | None = None
    cover_colour: str | None = None


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

    model_config = {"from_attributes": True}


class ProjectDetailResponse(ProjectResponse):
    target_places: list[PlaceSummaryResponse] = []


class PlaceImportLine(BaseModel):
    query: str


class PlaceImportRequest(BaseModel):
    lines: list[str]
