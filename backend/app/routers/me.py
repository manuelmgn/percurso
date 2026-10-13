from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from datetime import datetime, timezone

from app.config import settings
from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, UserRole
from app.schemas import UserResponse, UserPasswordChange, UserPreferencesUpdate
from app.services import user_service, image_service, activity_service
from app.models.enums import EntityAction, EntityType

router = APIRouter(prefix="/api/me", tags=["me"])

# Accepted date formats (strftime-style), applied across the whole UI
ALLOWED_DATE_FORMATS = {"%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d"}


@router.get("/", response_model=UserResponse)
def get_profile(user=Depends(get_current_user)):
    return user


@router.patch("/", response_model=UserResponse)
def update_profile(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    if payload.username is not None:
        new_username = payload.username.strip().lower()
        if new_username != user.username:
            existing = user_service.get_user_by_username(db, new_username)
            if existing and existing.id != user.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O nome de utilizador já está em uso")
            try:
                user.username = new_username
            except ValueError as e:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    if payload.timezone is not None:
        try:
            ZoneInfo(payload.timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Zona horária inválida")
        user.timezone = payload.timezone
    if payload.date_format is not None:
        if payload.date_format not in ALLOWED_DATE_FORMATS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de data inválido")
        user.date_format = payload.date_format
    if payload.theme is not None:
        user.theme = payload.theme
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    response: Response,
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    if user.role == UserRole.ADMIN:
        admin_count = db.query(User).filter(User.role == UserRole.ADMIN, User.is_active == True).count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível eliminar a conta do único administrador do sistema",
            )
    db.delete(user)
    db.commit()
    response.delete_cookie(key=settings.session_cookie_name)
    return None


@router.post("/password")
def change_password(
    payload: UserPasswordChange,
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    ok = user_service.change_password(db, user, payload)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A palavra-passe atual está incorreta")
    return {"message": "Palavra-passe atualizada"}


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Ficheiro demasiado grande (máx. 15 MB)")
    url, _, _ = image_service.process_and_save(content, file.content_type or "")
    user.avatar_url = url
    db.commit()
    db.refresh(user)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.USER, user.id, user.username)
    return user
