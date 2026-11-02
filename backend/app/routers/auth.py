import threading
import time

from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.auth import verify_password, create_session, get_current_user, get_session_token
from app.models import Session as UserSession
from app.schemas import LoginRequest, MeResponse
from app.services import user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Lightweight in-process login rate limiter (single-worker uvicorn). Keyed by
# client IP; X-Forwarded-For is honoured because uvicorn runs with
# --proxy-headers behind the published port.
_LOGIN_WINDOW_SECONDS = 5 * 60
_LOGIN_MAX_FAILURES = 5
_LOGIN_MAX_ATTEMPTS = 30
_login_lock = threading.Lock()
_login_failures: dict[str, list[float]] = {}
_login_attempts: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _recent(timestamps: list[float], now: float) -> list[float]:
    return [t for t in timestamps if now - t < _LOGIN_WINDOW_SECONDS]


def _check_login_rate_limit(ip: str, now: float):
    """Raise 429 when the rolling window is exhausted for this IP."""
    with _login_lock:
        attempts = _recent(_login_attempts.get(ip, []), now)
        failures = _recent(_login_failures.get(ip, []), now)
        if len(attempts) >= _LOGIN_MAX_ATTEMPTS or len(failures) >= _LOGIN_MAX_FAILURES:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas tentativas de início de sessão. Tente novamente mais tarde.",
            )
        attempts.append(now)
        _login_attempts[ip] = attempts


def _record_login_failure(ip: str, now: float):
    with _login_lock:
        _login_failures.setdefault(ip, []).append(now)


def _reset_login_rate_limit(ip: str):
    with _login_lock:
        _login_failures.pop(ip, None)
        _login_attempts.pop(ip, None)


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure_resolved,
        samesite="lax",
        max_age=settings.session_max_age_days * 24 * 60 * 60,
    )


def _clear_session_cookie(response: Response):
    response.delete_cookie(key=settings.session_cookie_name)


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    client_ip = _client_ip(request)
    now = time.monotonic()
    _check_login_rate_limit(client_ip, now)

    user = user_service.get_user_by_username(db, payload.username)
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        _record_login_failure(client_ip, now)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    _reset_login_rate_limit(client_ip)
    user = user_service.check_and_update_password_hash(db, user, payload.password)
    token, csrf_token = create_session(db, user)
    _set_session_cookie(response, token)
    return MeResponse(user=user, csrf_token=csrf_token)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), user=Depends(get_current_user)):
    token = get_session_token(request)
    if token:
        db.query(UserSession).filter(UserSession.token == token).delete()
        db.commit()
    _clear_session_cookie(response)
    return {"message": "Sessão terminada"}


@router.get("/me", response_model=MeResponse)
def me(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    token = get_session_token(request)
    csrf_token = ""
    if token:
        session = db.query(UserSession).filter(UserSession.token == token).first()
        if session and session.csrf_token:
            csrf_token = session.csrf_token
    return MeResponse(user=user, csrf_token=csrf_token)
