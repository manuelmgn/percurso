import logging
import time as _time

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt as jose_jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.security import decode_token

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer()


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> int:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id_str: str | None = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        return int(user_id_str)
    except (JWTError, ValueError) as exc:
        try:
            claims = jose_jwt.get_unverified_claims(credentials.credentials)
            exp = claims.get("exp", 0)
            now = int(_time.time())
            logger.warning(
                "Token rejected [%s]: exp=%s now=%s diff=%+ds sub=%s",
                type(exc).__name__, exp, now, exp - now, claims.get("sub"),
            )
        except Exception:
            logger.warning("Token rejected [%s]: could not inspect payload", type(exc).__name__)
        raise credentials_exception


async def get_current_user(
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db_session),
):
    from app.services.user_service import get_user_by_id

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilizador não encontrado ou inactivo",
        )
    return user


async def get_optional_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    """Returns the authenticated user or None — never raises 401."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[7:]
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id_str = payload.get("sub")
        if not user_id_str:
            return None
        from app.services.user_service import get_user_by_id
        user = await get_user_by_id(db, int(user_id_str))
        return user if user and user.is_active else None
    except Exception:
        return None


async def require_admin(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores",
        )
    return current_user
