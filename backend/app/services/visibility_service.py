from typing import Collection

from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import User, UserRole, Trip, TripPlace, TripProject, Project, ProjectPlace, Visibility, trip_participants, trip_visible_users, project_participants, project_visible_users


def _trip_list_options():
    """Eager loads for everything to_trip_list_response touches (creator,
    cover photo, place/project links); the nested joinedload on
    TripPlace.place also covers the search-by-place-name fan-out."""
    return (
        joinedload(Trip.creator),
        joinedload(Trip.immich_owner),
        joinedload(Trip.cover_photo),
        selectinload(Trip.places).joinedload(TripPlace.place),
        selectinload(Trip.projects).joinedload(TripProject.project),
    )


def _trip_is_visible_condition(user_id: int):
    """SQL condition for "the given user can see this trip row".

    A trip is visible when the user is its creator, its visibility is ALL,
    or — for PRIVATE / SPECIFIC — they are among its participants or its
    explicitly allowed viewers. FILTERED IN SQL so callers never have to
    load the whole trips table and traverse lazy collections (N+1)."""
    return or_(
        Trip.creator_id == user_id,
        Trip.visibility == Visibility.ALL,
        and_(
            Trip.visibility == Visibility.PRIVATE,
            exists().where(
                trip_participants.c.trip_id == Trip.id,
                trip_participants.c.user_id == user_id,
            ),
        ),
        and_(
            Trip.visibility == Visibility.SPECIFIC,
            exists().where(
                trip_visible_users.c.trip_id == Trip.id,
                trip_visible_users.c.user_id == user_id,
            ),
        ),
    )


def _project_is_visible_condition(user_id: int):
    """SQL condition for "the given user can see this project row"."""
    return or_(
        Project.creator_id == user_id,
        Project.visibility == Visibility.ALL,
        and_(
            Project.visibility == Visibility.PRIVATE,
            exists().where(
                project_participants.c.project_id == Project.id,
                project_participants.c.user_id == user_id,
            ),
        ),
        and_(
            Project.visibility == Visibility.SPECIFIC,
            exists().where(
                project_visible_users.c.project_id == Project.id,
                project_visible_users.c.user_id == user_id,
            ),
        ),
    )


def can_user_edit_entity(user: User, entity) -> bool:
    """Edit rule shared by trips and projects: creator or participant."""
    if entity.creator_id == user.id:
        return True
    return any(p.id == user.id for p in entity.participants)


def apply_user_links(db: Session, entity, data) -> None:
    """Replace an entity's participants/allowed viewers by the payload ids.
    Shared by trips and projects; each block only runs when its key was sent
    (PATCH may omit them), while on create assigning an empty list is a
    harmless no-op. Admin and inactive accounts are excluded so they can
    never be invited to a trip or project."""
    if data.participant_ids is not None:
        entity.participants = (
            db.query(User)
            .filter(User.id.in_(data.participant_ids), User.is_active == True, User.role != UserRole.ADMIN)
            .all()
        )
    if data.visible_user_ids is not None:
        entity.visible_users = (
            db.query(User)
            .filter(User.id.in_(data.visible_user_ids), User.is_active == True, User.role != UserRole.ADMIN)
            .all()
        )


def can_user_see_trip(db: Session, user: User, trip: Trip) -> bool:
    """Single-trip check via the same SQL rule as the list filters."""
    return (
        db.query(Trip.id)
        .filter(Trip.id == trip.id, _trip_is_visible_condition(user.id))
        .first()
        is not None
    )


def can_user_see_project(db: Session, user: User, project: Project) -> bool:
    """Single-project check via the same SQL rule as the list filters."""
    return (
        db.query(Project.id)
        .filter(Project.id == project.id, _project_is_visible_condition(user.id))
        .first()
        is not None
    )


def get_visible_trip_ids(db: Session, user: User) -> Collection[int]:
    """IDs of the trips the user can see (cheap: single indexed query)."""
    return {row[0] for row in db.query(Trip.id).filter(_trip_is_visible_condition(user.id))}


def get_visible_project_ids(db: Session, user: User) -> Collection[int]:
    """IDs of the projects the user can see."""
    return {row[0] for row in db.query(Project.id).filter(_project_is_visible_condition(user.id))}


def get_visible_trips(db: Session, user: User) -> list[Trip]:
    """Trip objects the user can see, filtered and ordered in the database."""
    return (
        db.query(Trip)
        .options(*_trip_list_options())
        .filter(_trip_is_visible_condition(user.id))
        .order_by(Trip.updated_at.desc())
        .all()
    )


def get_creator_profile_stats(db: Session, viewer: User, creator_id: int) -> tuple[int, int]:
    """(visible_trip_count, distinct_place_count) across the trips created
    by `creator_id` that `viewer` may see.

    Two aggregate queries instead of instantiating every trip and traversing
    its places lazily (the old O(trips) + N+1 in the public profile card)."""
    subq = (
        db.query(Trip.id)
        .filter(Trip.creator_id == creator_id, _trip_is_visible_condition(viewer.id))
        .subquery()
    )
    trip_count = db.query(func.count()).select_from(subq).scalar() or 0
    distinct_places = (
        db.query(func.count(func.distinct(TripPlace.place_id)))
        .join(subq, TripPlace.trip_id == subq.c.id)
        .scalar()
        or 0
    )
    return int(trip_count), int(distinct_places)


def get_visible_projects(db: Session, user: User) -> list[Project]:
    """Project objects the user can see, filtered and ordered in the database."""
    return (
        db.query(Project)
        .filter(_project_is_visible_condition(user.id))
        .order_by(Project.updated_at.desc())
        .all()
    )


def get_trips_for_place(db: Session, user: User, place_id: int) -> list[Trip]:
    """Visible trips containing this place. SQL-joined through the link
    table — the old detail page loaded every visible trip and traversed all
    of their places to test membership."""
    return (
        db.query(Trip)
        .options(*_trip_list_options())
        .filter(TripPlace.place_id == place_id, TripPlace.trip_id == Trip.id, _trip_is_visible_condition(user.id))
        .order_by(Trip.start_date.desc())
        .all()
    )


def get_projects_for_place(db: Session, user: User, place_id: int) -> list[Project]:
    """Visible projects containing this place (same SQL join approach)."""
    return (
        db.query(Project)
        .filter(ProjectPlace.place_id == place_id, ProjectPlace.project_id == Project.id, _project_is_visible_condition(user.id))
        .order_by(Project.updated_at.desc())
        .all()
    )
