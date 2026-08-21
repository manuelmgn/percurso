from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import and_, exists

from app.models import User, Project, ProjectPlace, Place, Trip, TripProject, TripPlace, Visibility
from app.schemas import ProjectCreate, ProjectUpdate
from app.services import visibility_service


def create_project(db: Session, user: User, data: ProjectCreate) -> Project:
    project = Project(
        name=data.name,
        description=data.description,
        visibility=data.visibility,
        map_mode=data.map_mode,
        creator_id=user.id,
    )
    db.add(project)
    db.flush()

    if data.participant_ids:
        participants = db.query(User).filter(User.id.in_(data.participant_ids)).all()
        project.participants = participants

    if data.visible_user_ids:
        visible_users = db.query(User).filter(User.id.in_(data.visible_user_ids)).all()
        project.visible_users = visible_users

    if data.place_ids:
        for place_id in data.place_ids:
            place = db.query(Place).filter(Place.id == place_id).first()
            if place:
                project_place = ProjectPlace(
                    project_id=project.id,
                    place_id=place.id,
                    added_by_id=user.id,
                    added_at=datetime.now(timezone.utc),
                )
                db.add(project_place)

    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, user: User, project: Project, data: ProjectUpdate) -> Project:
    if data.name is not None:
        project.name = data.name
    if data.description is not None:
        project.description = data.description
    if data.visibility is not None:
        project.visibility = data.visibility
    if data.map_mode is not None:
        project.map_mode = data.map_mode

    if data.participant_ids is not None:
        participants = db.query(User).filter(User.id.in_(data.participant_ids)).all()
        project.participants = participants

    if data.visible_user_ids is not None:
        visible_users = db.query(User).filter(User.id.in_(data.visible_user_ids)).all()
        project.visible_users = visible_users

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, user: User, project: Project) -> None:
    db.delete(project)
    db.commit()


def get_project_progress(db: Session, user: User, project: Project) -> dict:
    total_places = len(project.places)
    visited_places = 0

    for project_place in project.places:
        if project_place.is_unmarked:
            continue
        if is_place_visited_in_project(db, user, project.id, project_place.place_id):
            visited_places += 1

    progress_percent = (visited_places / total_places * 100) if total_places > 0 else 0
    is_completed = total_places > 0 and visited_places == total_places

    return {
        "total_places": total_places,
        "visited_places": visited_places,
        "progress_percent": progress_percent,
        "is_completed": is_completed,
    }


def is_place_visited_in_project(db: Session, user: User, project_id: int, place_id: int) -> bool:
    visible_trips = visibility_service.get_visible_trips(db, user)
    visible_trip_ids = {t.id for t in visible_trips}

    return db.query(
        exists().where(
            and_(
                TripPlace.place_id == place_id,
                TripPlace.trip_id.in_(visible_trip_ids),
                TripProject.project_id == project_id,
                TripProject.trip_id == TripPlace.trip_id,
            )
        )
    ).scalar()


def add_place_to_project(db: Session, user: User, project: Project, place: Place) -> ProjectPlace:
    existing = (
        db.query(ProjectPlace)
        .filter(ProjectPlace.project_id == project.id, ProjectPlace.place_id == place.id)
        .first()
    )
    if existing:
        return existing

    project_place = ProjectPlace(
        project_id=project.id,
        place_id=place.id,
        added_by_id=user.id,
        added_at=datetime.now(timezone.utc),
    )
    db.add(project_place)
    db.commit()
    db.refresh(project_place)
    return project_place


def remove_place_from_project(db: Session, user: User, project: Project, place_id: int) -> bool:
    project_place = (
        db.query(ProjectPlace)
        .filter(ProjectPlace.project_id == project.id, ProjectPlace.place_id == place_id)
        .first()
    )
    if not project_place:
        return False

    db.delete(project_place)
    db.commit()
    return True


def toggle_place_unmarked(db: Session, user: User, project: Project, place_id: int) -> Optional[ProjectPlace]:
    """Manually unmark/remark a target place as visited (spec: fixing a
    place marked visited by mistake, without deleting the trip)."""
    project_place = (
        db.query(ProjectPlace)
        .filter(ProjectPlace.project_id == project.id, ProjectPlace.place_id == place_id)
        .first()
    )
    if not project_place:
        return None
    project_place.is_unmarked = not project_place.is_unmarked
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project_place)
    return project_place


def can_user_edit_project(user: User, project: Project) -> bool:
    if project.creator_id == user.id:
        return True
    participant_ids = [p.id for p in project.participants]
    return user.id in participant_ids
