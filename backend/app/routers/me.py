from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.schemas import UserResponse, UserPasswordChange, UserPreferencesUpdate
from app.services import user_service, image_service, activity_service
from app.models.enums import EntityAction, EntityType

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/", response_model=UserResponse)
def get_profile(user=Depends(get_current_user)):
    return user


@router.patch("/", response_model=UserResponse)
def update_profile(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if payload.timezone is not None:
        user.timezone = payload.timezone
    if payload.date_format is not None:
        user.date_format = payload.date_format
    if payload.theme is not None:
        user.theme = payload.theme
    db.commit()
    db.refresh(user)
    return user


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
    url, _, _ = image_service.process_and_save(content, file.content_type or "")
    user.avatar_url = url
    db.commit()
    db.refresh(user)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.USER, user.id, user.username)
    return user
