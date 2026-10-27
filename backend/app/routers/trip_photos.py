from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.auth import get_current_user, validate_csrf
from app.config import settings
from app.database import get_db
from app.models import User, Photo
from app.schemas import PhotoResponse, PhotoCaptionUpdate, PhotoOrderUpdate
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
        position=photo.position,
        taken_at=photo.taken_at,
        lat=photo.lat,
        lon=photo.lon,
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
        .order_by(Photo.position.asc(), Photo.created_at.asc(), Photo.id.asc())
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
    # New photos append to the end of the manual order.
    max_position = db.query(func.max(Photo.position)).filter(Photo.trip_id == trip.id).scalar()
    next_position = (max_position + 1) if max_position is not None else 0
    try:
        for f, content in contents:
            url, width, height = image_service.process_and_save(content, f.content_type or "")
            taken_at, lat, lon = image_service.extract_exif(content, f.content_type or "")
            photo = Photo(
                trip_id=trip.id,
                uploader_id=user.id,
                url=url,
                width=width,
                height=height,
                position=next_position,
                taken_at=taken_at,
                lat=lat,
                lon=lon,
            )
            next_position += 1
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


@router.put("/order", response_model=list[PhotoResponse])
def reorder_photos(
    trip_id: int,
    payload: PhotoOrderUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    """Reassign manual positions. The payload is the FULL desired order and
    must list exactly the trip's photo ids (same set, no extras, no dupes)."""
    trip = _get_editable_trip(db, trip_id, user)

    current_ids = {row[0] for row in db.query(Photo.id).filter(Photo.trip_id == trip.id).all()}
    requested_ids = payload.photo_ids
    if len(set(requested_ids)) != len(requested_ids) or set(requested_ids) != current_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A ordem tem de incluir exatamente as fotografias da viagem",
        )

    photos = db.query(Photo).filter(Photo.trip_id == trip.id).all()
    by_id = {p.id: p for p in photos}
    for position, photo_id in enumerate(requested_ids):
        by_id[photo_id].position = position
    db.commit()

    ordered = [by_id[photo_id] for photo_id in requested_ids]
    for photo in ordered:
        db.refresh(photo)
    return [_photo_to_response(p) for p in ordered]


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
    # Clear the trip cover if it pointed at this photo. Needed on databases
    # where the cover FK could not be added (SQLite ALTER limitation); on
    # fresh databases ON DELETE SET NULL also does it, and this write is
    # then a harmless no-op.
    trip = photo.trip
    if trip.cover_photo_id == photo.id:
        trip.cover_photo_id = None
    db.delete(photo)
    db.commit()
    # Best effort: the file may already be gone from a previous partial cleanup.
    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        pass
    return None
