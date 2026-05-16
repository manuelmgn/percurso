from datetime import date

from pydantic import AnyHttpUrl, BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    display_name: str
    role: str = "user"

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
    display_name: str | None = None
    biography: str | None = None
    website_url: AnyHttpUrl | None = None
    avatar_url: AnyHttpUrl | None = None
    default_trip_visibility: str | None = None
    default_project_visibility: str | None = None
    visited_places_visibility: str | None = None

    @field_validator("website_url", "avatar_url", mode="before")
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


class ProjectPublicSummary(BaseModel):
    id: int
    title: str
    cover_image_url: str | None
    cover_colour: str | None
    target_place_count: int
    visited_place_count: int


class VisitedPlacePublic(BaseModel):
    id: int
    name: str
    name_pt: str | None
    place_type: str
    country_code: str | None
    region_name: str | None


class UserProfileResponse(UserPublicResponse):
    trips: list[TripPublicSummary] = []
    projects: list[ProjectPublicSummary] = []
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
