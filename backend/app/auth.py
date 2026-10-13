import secrets
from datetime import datetime, timezone
from typing import Optional

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Request, HTTPException, status, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User, Session as UserSession

ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        ph.verify(password_hash, password)
        return True
    except VerifyMismatchError:
        return False


def needs_rehash(password_hash: str) -> bool:
    return ph.check_needs_rehash(password_hash)


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session = UserSession(
        token=token,
        user_id=user.id,
        expires_at=UserSession.default_expiry(),
    )
    db.add(session)
    db.commit()
    return token


def get_session_token(request: Request) -> Optional[str]:
    return request.cookies.get(settings.session_cookie_name)


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = get_session_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    session = db.query(UserSession).filter(UserSession.token == token).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")
    if session.is_expired():
        # Drop expired sessions so they do not accumulate in the table.
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilizador inativo")

    session.extend()
    db.commit()
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="É necessário ser administrador")
    return user


def get_csrf_token(request: Request) -> str:
    return request.headers.get("x-csrf-token", "")


def validate_csrf(request: Request, user: User = Depends(get_current_user)) -> User:
    token = get_csrf_token(request)
    session_token = get_session_token(request)
    if not token or not session_token or token != session_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token CSRF inválido")
    return user


def require_admin_csrf(user: User = Depends(validate_csrf)) -> User:
    """Admin-only mutation guard: session + CSRF + admin role."""
    if not user.is_admin():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="É necessário ser administrador")
    return user
