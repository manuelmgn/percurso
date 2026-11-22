"""Shared fetch-or-404 guards for the routers.

Every router applies the same deliberate-404 rule (never 403) so entity ids
cannot be probed; keeping the checks here stops the copies from drifting."""
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User, Trip, Project
from app.services import trip_service, project_service, visibility_service

_TRIP_NOT_FOUND = "Viagem não encontrada"
_PROJECT_NOT_FOUND = "Projeto não encontrado"


def get_visible_trip_or_404(db: Session, trip_id: int, user: User) -> Trip:
    trip = trip_service.get_trip_by_id(db, trip_id)
    if not trip or not visibility_service.can_user_see_trip(db, user, trip):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_TRIP_NOT_FOUND)
    return trip


def get_editable_trip_or_404(db: Session, trip_id: int, user: User) -> Trip:
    trip = trip_service.get_trip_by_id(db, trip_id)
    # Editing also requires visibility: a participant of a SPECIFIC trip who
    # is not among its allowed viewers must not edit through a leaked id.
    if (
        not trip
        or not trip_service.can_user_edit_trip(user, trip)
        or not visibility_service.can_user_see_trip(db, user, trip)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_TRIP_NOT_FOUND)
    return trip


def get_visible_project_or_404(db: Session, project_id: int, user: User) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not visibility_service.can_user_see_project(db, user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PROJECT_NOT_FOUND)
    return project


def get_editable_project_or_404(db: Session, project_id: int, user: User) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    # Same rule as trips: editing also requires visibility.
    if (
        not project
        or not project_service.can_user_edit_project(user, project)
        or not visibility_service.can_user_see_project(db, user, project)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_PROJECT_NOT_FOUND)
    return project
