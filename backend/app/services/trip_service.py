from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.config import settings
from app.models import User, Trip, TripPlace, TripProject, Place, Project, Photo
from app.sanitize import sanitize_notes
from app.schemas import TripCreate, TripUpdate
from app.services import visibility_service, project_service, notification_service


def trip_display_name(trip: Trip) -> str:
    return trip.title or f"Viagem {trip.start_date} – {trip.end_date}"


def create_trip(db: Session, user: User, data: TripCreate) -> Trip:
    end_date = data.end_date or data.start_date

    trip = Trip(
        title=(data.title or "").strip() or None,
        start_date=data.start_date,
        end_date=end_date,
        notes=sanitize_notes(data.notes),
        visibility=data.visibility,
        creator_id=user.id,
        companions_text=data.companions_text,
    )
    db.add(trip)
    db.flush()

    _update_relations(db, trip, data)
    db.commit()
    db.refresh(trip)
    notification_service.notify_participants(
        db,
        user,
        notif_type="trip_created",
        entity_type="trip",
        entity_id=trip.id,
        entity_name=trip_display_name(trip),
        participant_ids=[p.id for p in trip.participants],
    )
    return trip


def update_trip(db: Session, user: User, trip: Trip, data: TripUpdate) -> Trip:
    if data.title is not None:
        trip.title = data.title.strip() or None
    if data.start_date is not None:
        trip.start_date = data.start_date
    if data.end_date is not None:
        trip.end_date = data.end_date or trip.start_date
    if data.notes is not None:
        trip.notes = sanitize_notes(data.notes)
    if data.visibility is not None:
        trip.visibility = data.visibility
    if data.companions_text is not None:
        trip.companions_text = data.companions_text

    if data.clear_cover:
        trip.cover_photo_id = None
    elif data.cover_photo_id is not None:
        # Deliberate 404 (not 403/422) so ids of other trips' photos cannot
        # even be probed, matching the photos router.
        photo = (
            db.query(Photo)
            .filter(Photo.id == data.cover_photo_id, Photo.trip_id == trip.id)
            .first()
        )
        if not photo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")
        trip.cover_photo_id = photo.id

    _update_relations(db, trip, data)
    trip.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(trip)
    notification_service.notify_participants(
        db,
        user,
        notif_type="trip_updated",
        entity_type="trip",
        entity_id=trip.id,
        entity_name=trip_display_name(trip),
        participant_ids=[p.id for p in trip.participants],
    )
    return trip


def _update_relations(db: Session, trip: Trip, data) -> None:
    """Replace the trip's places/projects/participants/viewers by what the
    payload carries. Each block only runs when the ids key was sent (PATCH
    may omit them). Unknown place/project ids are skipped, matching the
    tolerant behaviour elsewhere; participant ids resolve through orml."""
    if data.place_ids is not None:
        # Rebuild the whole list (the association carries no per-row state
        # worth diffing). Validate all ids in one IN query instead of one
        # query per id.
        db.query(TripPlace).filter(TripPlace.trip_id == trip.id).delete()
        valid_place_ids = (
            {row[0] for row in db.query(Place.id).filter(Place.id.in_(set(data.place_ids)))}
            if data.place_ids
            else set()
        )
        for place_id in valid_place_ids:
            db.add(TripPlace(trip_id=trip.id, place_id=place_id, added_at=datetime.now(timezone.utc)))

    if data.project_ids is not None:
        db.query(TripProject).filter(TripProject.trip_id == trip.id).delete()
        valid_project_ids = (
            {row[0] for row in db.query(Project.id).filter(Project.id.in_(set(data.project_ids)))}
            if data.project_ids
            else set()
        )
        for project_id in valid_project_ids:
            db.add(TripProject(trip_id=trip.id, project_id=project_id))

    if data.participant_ids is not None:
        trip.participants = db.query(User).filter(User.id.in_(data.participant_ids)).all()

    if data.visible_user_ids is not None:
        trip.visible_users = db.query(User).filter(User.id.in_(data.visible_user_ids)).all()


def delete_trip(db: Session, trip: Trip) -> None:
    """Deletes the trip and associated photos/files."""
    photos = db.query(Photo).filter(Photo.trip_id == trip.id).all()
    for photo in photos:
        try:
            filename = photo.url.rsplit("/", 1)[-1]
            file_path = settings.uploads_dir / filename
            file_path.unlink(missing_ok=True)
        except OSError:
            pass
    db.delete(trip)
    db.commit()


def get_affected_projects(db: Session, user: User, trip: Trip) -> list[Project]:
    projects = []
    for trip_project in trip.projects:
        project = trip_project.project
        if project_service.can_user_edit_project(user, project):
            projects.append(project)
    return projects


def can_user_edit_trip(user: User, trip: Trip) -> bool:
    if trip.creator_id == user.id:
        return True
    participant_ids = [p.id for p in trip.participants]
    return user.id in participant_ids


def list_trips(db: Session, user: User) -> list[Trip]:
    """Visible trips, most recently updated first (ordered in the DB)."""
    return visibility_service.get_visible_trips(db, user)


def get_trip_by_id(db: Session, trip_id: int) -> Optional[Trip]:
    return db.query(Trip).filter(Trip.id == trip_id).first()
