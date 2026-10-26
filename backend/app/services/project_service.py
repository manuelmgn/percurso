from datetime import datetime, timezone
from typing import Collection, Optional

from sqlalchemy.orm import Session

from app.models import User, Project, ProjectPlace, Place, Trip, TripProject, TripPlace
from app.schemas import ProjectCreate, ProjectUpdate
from app.services import visibility_service, notification_service


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
    notification_service.notify_participants(
        db,
        user,
        notif_type="project_created",
        entity_type="project",
        entity_id=project.id,
        entity_name=project.name,
        participant_ids=[p.id for p in project.participants],
    )
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
    notification_service.notify_participants(
        db,
        user,
        notif_type="project_updated",
        entity_type="project",
        entity_id=project.id,
        entity_name=project.name,
        participant_ids=[p.id for p in project.participants],
    )
    return project


def delete_project(db: Session, user: User, project: Project) -> None:
    db.delete(project)
    db.commit()


def get_project_progress(
    db: Session,
    user: User,
    project: Project,
    visited_place_ids: set[int] | None = None,
) -> dict:
    """Progress summary. Pass `visited_place_ids` (from
    `get_visited_place_ids_in_project`) to reuse a single computation.

    ``pp.is_unmarked`` deliberately excludes a place from progress even
    when a trip visits it (manual unvisit — see `toggle_place_unmarked`)."""
    if visited_place_ids is None:
        visited_place_ids = get_visited_place_ids_in_project(db, user, project.id)
    return _compute_progress(project, visited_place_ids)


def _compute_progress(project: Project, visited_place_ids: set[int]) -> dict:
    """Shared progress arithmetic, fed by the single- and batched paths."""
    total_places = len(project.places)
    visited_places = sum(
        1
        for pp in project.places
        if not pp.is_unmarked and pp.place_id in visited_place_ids
    )
    progress_percent = (visited_places / total_places * 100) if total_places > 0 else 0
    is_completed = total_places > 0 and visited_places == total_places
    return {
        "total_places": total_places,
        "visited_places": visited_places,
        "progress_percent": progress_percent,
        "is_completed": is_completed,
    }


def get_visited_place_ids_in_project(db: Session, user: User, project_id: int) -> set[int]:
    """Place IDs of the project that appear in any trip the user can see.

    One aggregate query for the whole project instead of one existence check
    per place (the old code also re-resolved visible trips per place)."""
    if not (visible_trip_ids := visibility_service.get_visible_trip_ids(db, user)):
        return set()
    visited = db.query(TripPlace.place_id).filter(
        TripPlace.trip_id.in_(visible_trip_ids),
        TripProject.project_id == project_id,
        TripProject.trip_id == TripPlace.trip_id,
    )
    return {row[0] for row in visited}


def get_progress_by_project(
    db: Session,
    user: User,
    projects: Collection["Project"],
) -> dict[int, dict]:
    """Progress for many projects at once.

    The visible-trip set is resolved once, then one query fetches every
    (project, place) visit pair — the per-project path ran 2 queries plus a
    lazy `project.places` load each, which multiplied fast on the stats page
    and project listings."""
    projects = list(projects)
    visited_map: dict[int, set[int]] = {p.id: set() for p in projects}
    project_ids = [p.id for p in projects]
    if project_ids:
        visible_trip_ids = visibility_service.get_visible_trip_ids(db, user)
        if visible_trip_ids:
            rows = db.query(TripProject.project_id, TripPlace.place_id).filter(
                TripProject.project_id.in_(project_ids),
                TripProject.trip_id == TripPlace.trip_id,
                TripProject.trip_id.in_(visible_trip_ids),
            )
            for project_id, place_id in rows:
                visited_map[project_id].add(place_id)
    return {p.id: _compute_progress(p, visited_map[p.id]) for p in projects}


def is_place_visited_in_project(db: Session, user: User, project_id: int, place_id: int) -> bool:
    return place_id in get_visited_place_ids_in_project(db, user, project_id)


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
