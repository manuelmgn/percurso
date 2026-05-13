from pydantic import BaseModel, EmailStr, HttpUrl, field_validator


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
    website_url: str | None = None
    avatar_url: str | None = None
    default_trip_visibility: str | None = None
    default_project_visibility: str | None = None
    visited_places_visibility: str | None = None


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None
    biography: str | None
    website_url: str | None
    role: str
    is_active: bool
    default_trip_visibility: str
    default_project_visibility: str
    visited_places_visibility: str

    model_config = {"from_attributes": True}


class UserPublicResponse(BaseModel):
    id: int
    username: str
    display_name: str
    avatar_url: str | None
    biography: str | None
    website_url: str | None

    model_config = {"from_attributes": True}


class PasswordReset(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("A palavra-passe deve ter pelo menos 8 caracteres")
        return v
