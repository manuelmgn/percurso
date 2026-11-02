from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Response, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from datetime import datetime, timezone

from app.config import settings
from app.database import get_db
from app.auth import get_current_user, get_session_token, validate_csrf
from app.models import User, UserRole, Session as UserSession, Photo
from app.schemas import UserResponse, UserPasswordChange, UserPreferencesUpdate
from app.services import user_service, image_service, activity_service
from app.models.enums import EntityAction, EntityType

router = APIRouter(prefix="/api/me", tags=["me"])

# Accepted date formats (strftime-style), applied across the whole UI
ALLOWED_DATE_FORMATS = {"%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d"}


def _unlink_upload(url: str | None) -> None:
    """Best-effort removal of a file stored in the uploads volume."""
    if not url or not url.startswith("/uploads/"):
        return
    try:
        (settings.uploads_dir / url.rsplit("/", 1)[-1]).unlink(missing_ok=True)
    except OSError:
        pass


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
    if payload.yearly_trip_goal is not None:
        # 0 clears the goal (hides the dashboard progress bar).
        user.yearly_trip_goal = payload.yearly_trip_goal or None
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
    # FK cascades remove the photo rows but not the files on disk; collect
    # the URLs first (uploaded by the user, or on trips they created) and
    # unlink them after the delete has committed.
    trip_ids = [t.id for t in user.trips]
    photo_filter = Photo.uploader_id == user.id
    if trip_ids:
        photo_filter = or_(photo_filter, Photo.trip_id.in_(trip_ids))
    photo_urls = [url for (url,) in db.query(Photo.url).filter(photo_filter).all()]
    avatar_url = user.avatar_url
    db.delete(user)
    db.commit()
    response.delete_cookie(key=settings.session_cookie_name)
    for url in photo_urls:
        _unlink_upload(url)
    _unlink_upload(avatar_url)
    return None


@router.post("/password")
def change_password(
    request: Request,
    payload: UserPasswordChange,
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    ok = user_service.change_password(db, user, payload)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A palavra-passe atual está incorreta")
    # Invalidate all other sessions so stolen tokens cannot be reused.
    current_token = get_session_token(request)
    q = db.query(UserSession).filter(UserSession.user_id == user.id)
    if current_token:
        q = q.filter(UserSession.token != current_token)
    q.delete(synchronize_session=False)
    db.commit()
    return {"message": "Palavra-passe atualizada"}


@router.post("/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    content = await file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Ficheiro demasiado grande (máx. 15 MB)")
    previous_avatar = user.avatar_url
    url, _, _ = image_service.process_and_save(content, file.content_type or "")
    user.avatar_url = url
    db.commit()
    db.refresh(user)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.USER, user.id, user.username)
    # The replaced avatar file is no longer referenced by anyone.
    _unlink_upload(previous_avatar)
    return user
