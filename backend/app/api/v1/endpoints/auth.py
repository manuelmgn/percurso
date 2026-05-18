from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import JWTError
from jose import jwt as jose_jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.limiter import limiter
from app.core.redis import revoke_refresh_jti, store_refresh_jti, verify_and_revoke_refresh_jti
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.schemas.auth import LoginRequest, LoginResponse, TokenResponse
from app.schemas.user import UserResponse
from app.services.user_service import authenticate_user

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_TTL = settings.refresh_token_expire_days * 86400


@router.post("/login", response_model=LoginResponse)
@limiter.limit(f"{settings.rate_limit_auth}/minute")
async def login(
    request: Request,
    data: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
):
    user = await authenticate_user(db, data.username, data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nome de utilizador ou palavra-passe incorretos",
        )
    access_token = create_access_token(user.id, {"role": user.role})
    refresh_token, jti = create_refresh_token(user.id)
    await store_refresh_jti(jti, _REFRESH_TTL)

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/v1/auth",
    )

    return LoginResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit(f"{settings.rate_limit_auth}/minute")
async def refresh_token(request: Request, response: Response, db: AsyncSession = Depends(get_db_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token de actualização inválido",
    )
    refresh_token_value = request.cookies.get("refresh_token")
    if not refresh_token_value:
        raise credentials_exception

    try:
        payload = decode_token(refresh_token_value)
        if payload.get("type") != "refresh":
            raise credentials_exception
        jti = payload.get("jti")
        if not jti:
            raise credentials_exception
        user_id = int(payload["sub"])
    except (JWTError, ValueError):
        raise credentials_exception

    if not await verify_and_revoke_refresh_jti(jti):
        raise credentials_exception

    from app.services.user_service import get_user_by_id
    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise credentials_exception

    new_access = create_access_token(user_id, {"role": user.role})
    new_refresh, new_jti = create_refresh_token(user_id)
    await store_refresh_jti(new_jti, _REFRESH_TTL)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=_REFRESH_TTL,
        path="/api/v1/auth",
    )

    return TokenResponse(
        access_token=new_access,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response):
    refresh_token_value = request.cookies.get("refresh_token")
    if refresh_token_value:
        try:
            claims = jose_jwt.get_unverified_claims(refresh_token_value)
            jti = claims.get("jti")
            if jti:
                await revoke_refresh_jti(jti)
        except Exception:
            pass
    response.delete_cookie(key="refresh_token", path="/api/v1/auth")
