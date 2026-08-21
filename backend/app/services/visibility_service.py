from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models import User, Trip, Project, Visibility


def can_user_see_trip(db: Session, user: User, trip: Trip) -> bool:
    if trip.creator_id == user.id:
        return True

    if trip.visibility == Visibility.ALL:
        return True

    if trip.visibility == Visibility.PRIVATE:
        participant_ids = [p.id for p in trip.participants]
        return user.id in participant_ids

    if trip.visibility == Visibility.SPECIFIC:
        visible_ids = [u.id for u in trip.visible_users]
        return user.id in visible_ids

    return False


def can_user_see_project(db: Session, user: User, project: Project) -> bool:
    if project.creator_id == user.id:
        return True

    if project.visibility == Visibility.ALL:
        return True

    if project.visibility == Visibility.PRIVATE:
        participant_ids = [p.id for p in project.participants]
        return user.id in participant_ids

    if project.visibility == Visibility.SPECIFIC:
        visible_ids = [u.id for u in project.visible_users]
        return user.id in visible_ids

    return False


def get_visible_trips(db: Session, user: User) -> list[Trip]:
    trips = db.query(Trip).all()
    return [t for t in trips if can_user_see_trip(db, user, t)]


def get_visible_projects(db: Session, user: User) -> list[Project]:
    projects = db.query(Project).all()
    return [p for p in projects if can_user_see_project(db, user, p)]
