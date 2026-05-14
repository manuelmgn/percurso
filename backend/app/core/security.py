import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

settings = get_settings()

ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(subject: str | int, extra: dict[str, Any] | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload: dict[str, Any] = {"sub": str(subject), "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(subject: str | int) -> tuple[str, str]:
    """Returns (encoded_token, jti). Caller must store jti in Redis."""
    jti = secrets.token_hex(16)
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "type": "refresh",
        "jti": jti,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM), jti


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=[ALGORITHM],
        options={"leeway": 30},  # tolerate 30 s of clock skew
    )


def generate_sharing_token() -> str:
    """Cryptographically random token for sharing links."""
    return secrets.token_urlsafe(32)


def generate_invite_token() -> str:
    """Cryptographically random token for companion/collaborator invitations."""
    return secrets.token_urlsafe(24)
