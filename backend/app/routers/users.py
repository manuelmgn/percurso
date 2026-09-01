from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, require_admin, require_admin_csrf
from app.models import User
from app.schemas import UserCreate, UserUpdate, UserResponse, PasswordResetRequest, PublicProfileResponse
from app.services import user_service, visibility_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/public/{username}", response_model=PublicProfileResponse)
def get_public_profile(
    username: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Profile card visible to any logged-in user. Only counts trips the
    requester is allowed to see."""
    target = user_service.get_user_by_username(db, username)
    if not target or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")

    visible_trips = [
        t for t in visibility_service.get_visible_trips(db, user) if t.creator_id == target.id
    ]
    place_ids = {tp.place_id for t in visible_trips for tp in t.places}
    return PublicProfileResponse(
        username=target.username,
        avatar_url=target.avatar_url,
        created_at=target.created_at,
        trip_count=len(visible_trips),
        place_count=len(place_ids),
    )


@router.get("/", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return user_service.list_users(db)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), admin=Depends(require_admin_csrf)):
    existing = user_service.get_user_by_username(db, payload.username)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O nome de utilizador já existe")
    return user_service.create_user(db, payload)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin_csrf),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")
    if payload.username is not None:
        existing = user_service.get_user_by_username(db, payload.username)
        if existing and existing.id != user_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="O nome de utilizador já existe")
    return user_service.update_user(db, user, payload)


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin_csrf),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")
    user_service.reset_password(db, user, payload.new_password)
    return {"message": "Palavra-passe redefinida"}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin_csrf),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não te podes eliminar a ti próprio")
    db.delete(user)
    db.commit()
    return None
