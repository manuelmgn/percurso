from pydantic import BaseModel

from app.schemas.user import UserResponse


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class LoginResponse(TokenResponse):
    """Extends TokenResponse with the authenticated user so the client
    doesn't need a second GET /users/me round-trip after login."""
    user: UserResponse


