from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.auth import verify_password, create_session, get_current_user, get_session_token
from app.schemas import LoginRequest, MeResponse
from app.services import user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        max_age=settings.session_max_age_days * 24 * 60 * 60,
    )


def _clear_session_cookie(response: Response):
    response.delete_cookie(key=settings.session_cookie_name)


@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = user_service.get_user_by_username(db, payload.username)
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    user = user_service.check_and_update_password_hash(db, user, payload.password)
    token = create_session(db, user)
    _set_session_cookie(response, token)
    return MeResponse(user=user, csrf_token=token)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db), user=Depends(get_current_user)):
    token = get_session_token(request)
    if token:
        from app.models import Session as UserSession
        db.query(UserSession).filter(UserSession.token == token).delete()
        db.commit()
    _clear_session_cookie(response)
    return {"message": "Sessão terminada"}


@router.get("/me", response_model=MeResponse)
def me(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    token = get_session_token(request)
    return MeResponse(user=user, csrf_token=token or "")
