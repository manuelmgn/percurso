from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, validate_csrf
from app.config import settings
from app.database import get_db
from app.models import User, Photo
from app.schemas import PhotoResponse, PhotoCaptionUpdate
from app.services import trip_service, visibility_service, image_service

router = APIRouter(prefix="/api/trips/{trip_id}/photos", tags=["photos"])


def _photo_to_response(photo: Photo) -> PhotoResponse:
    return PhotoResponse(
        id=photo.id,
        trip_id=photo.trip_id,
        url=photo.url,
        width=photo.width,
        height=photo.height,
        caption=photo.caption,
        uploader_id=photo.uploader_id,
        uploader_username=photo.uploader.username,
        created_at=photo.created_at,
    )


def _get_visible_trip(db: Session, trip_id: int, user: User):
    trip = trip_service.get_trip_by_id(db, trip_id)
    if not trip or not visibility_service.can_user_see_trip(db, user, trip):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viagem não encontrada")
    return trip


def _get_editable_trip(db: Session, trip_id: int, user: User):
    trip = trip_service.get_trip_by_id(db, trip_id)
    if not trip or not trip_service.can_user_edit_trip(user, trip):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viagem não encontrada")
    return trip


def _get_editable_photo(db: Session, trip_id: int, user: User, photo_id: int) -> Photo:
    """Photo inside the trip that this user may manage (uploader or creator).

    Deliberate 404 (not 403) so outsiders cannot even learn the id exists."""
    trip = _get_editable_trip(db, trip_id, user)
    photo = db.query(Photo).filter(Photo.id == photo_id, Photo.trip_id == trip_id).first()
    if not photo or (photo.uploader_id != user.id and trip.creator_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")
    return photo


def _uploads_path(url: str) -> Path:
    return settings.uploads_dir / url.rsplit("/", 1)[-1]


@router.get("/", response_model=list[PhotoResponse])
def list_photos(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_visible_trip(db, trip_id, user)
    photos = (
        db.query(Photo)
        .filter(Photo.trip_id == trip.id)
        .order_by(Photo.created_at.asc(), Photo.id.asc())
        .all()
    )
    return [_photo_to_response(p) for p in photos]


@router.post("/", response_model=list[PhotoResponse], status_code=status.HTTP_201_CREATED)
async def upload_photos(
    trip_id: int,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    trip = _get_editable_trip(db, trip_id, user)

    # Validate everything before writing anything: either all photos are
    # created or none are.
    contents: list[tuple[UploadFile, bytes]] = []
    for f in files:
        content = await f.read()
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"Ficheiro demasiado grande (máx. 15 MB): {f.filename}",
            )
        if (f.content_type or "") not in image_service.ALLOWED_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Tipo de ficheiro não suportado: {f.filename}",
            )
        contents.append((f, content))

    photos: list[Photo] = []
    try:
        for f, content in contents:
            url, width, height = image_service.process_and_save(content, f.content_type or "")
            photo = Photo(
                trip_id=trip.id,
                uploader_id=user.id,
                url=url,
                width=width,
                height=height,
            )
            db.add(photo)
            photos.append(photo)
        db.commit()
    except Exception:
        db.rollback()
        # Remove any files already written so a failed batch leaves no orphans.
        for photo in photos:
            try:
                _uploads_path(photo.url).unlink(missing_ok=True)
            except OSError:
                pass
        raise

    for photo in photos:
        db.refresh(photo)
    return [_photo_to_response(p) for p in photos]


@router.patch("/{photo_id}", response_model=PhotoResponse)
def update_caption(
    trip_id: int,
    photo_id: int,
    payload: PhotoCaptionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    photo = _get_editable_photo(db, trip_id, user, photo_id)

    photo.caption = (payload.caption or "").strip() or None
    db.commit()
    db.refresh(photo)
    return _photo_to_response(photo)


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    trip_id: int,
    photo_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    photo = _get_editable_photo(db, trip_id, user, photo_id)

    file_path = _uploads_path(photo.url)
    db.delete(photo)
    db.commit()
    # Best effort: the file may already be gone from a previous partial cleanup.
    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        pass
    return None
