from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import User, Trip, TripPlace, TripProject, Place, Project, Visibility
from app.sanitize import sanitize_notes
from app.schemas import TripCreate, TripUpdate
from app.services import visibility_service, project_service, notification_service


def _trip_display_name(trip: Trip) -> str:
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
        entity_name=_trip_display_name(trip),
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
        entity_name=_trip_display_name(trip),
        participant_ids=[p.id for p in trip.participants],
    )
    return trip


def _update_relations(db: Session, trip: Trip, data) -> None:
    if hasattr(data, 'place_ids') and data.place_ids is not None:
        db.query(TripPlace).filter(TripPlace.trip_id == trip.id).delete()
        for place_id in set(data.place_ids):
            place = db.query(Place).filter(Place.id == place_id).first()
            if place:
                trip_place = TripPlace(trip_id=trip.id, place_id=place.id, added_at=datetime.now(timezone.utc))
                db.add(trip_place)

    if hasattr(data, 'project_ids') and data.project_ids is not None:
        db.query(TripProject).filter(TripProject.trip_id == trip.id).delete()
        for project_id in set(data.project_ids):
            project = db.query(Project).filter(Project.id == project_id).first()
            if project:
                trip_project = TripProject(trip_id=trip.id, project_id=project.id)
                db.add(trip_project)

    if hasattr(data, 'participant_ids') and data.participant_ids is not None:
        participants = db.query(User).filter(User.id.in_(data.participant_ids)).all()
        trip.participants = participants

    if hasattr(data, 'visible_user_ids') and data.visible_user_ids is not None:
        visible_users = db.query(User).filter(User.id.in_(data.visible_user_ids)).all()
        trip.visible_users = visible_users


def delete_trip(db: Session, user: User, trip: Trip) -> None:
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
    trips = visibility_service.get_visible_trips(db, user)
    return sorted(trips, key=lambda t: t.updated_at, reverse=True)


def get_trip_by_id(db: Session, trip_id: int) -> Optional[Trip]:
    return db.query(Trip).filter(Trip.id == trip_id).first()
