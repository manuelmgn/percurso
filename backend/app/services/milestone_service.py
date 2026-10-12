from sqlalchemy.orm import Session

from app.models import User, Milestone
from app.services import visibility_service, project_service


def _achieved_milestones(db: Session, user: User) -> dict[str, dict]:
    """Compute the currently-achieved milestone keys for the user, mapped to
    their response info dicts. Only project completions are celebrated."""
    achieved: dict[str, dict] = {}

    projects = visibility_service.get_visible_projects(db, user)
    for project in projects:
        progress = project_service.get_project_progress(db, user, project)
        if progress["total_places"] <= 0:
            continue
        if progress["is_completed"]:
            achieved[f"project_progress:{project.id}:100"] = {
                "key": f"project_progress:{project.id}:100",
                "kind": "project_progress",
                "project_id": project.id,
                "project_name": project.name,
                "percent": 100,
                "count": None,
            }

    return achieved


SEED_MARKER_KEY = "seeded"


def check_milestones(db: Session, user: User) -> list[dict]:
    """Persist newly-achieved milestones and return info dicts for the new
    ones only. On the very first call for a user, all currently-achieved keys
    are seeded silently and an empty list is returned, so existing users are
    not flooded with confetti.

    The seeding is marked with a sentinel row: detecting "first call" by the
    absence of rows is not enough, because a fresh user typically has no
    achieved milestones yet and would otherwise be re-seeded (silently) on
    every call until the first milestone, swallowing its celebration."""
    achieved = _achieved_milestones(db, user)

    existing = db.query(Milestone).filter(Milestone.user_id == user.id).all()
    if not existing:
        db.add(Milestone(user_id=user.id, key=SEED_MARKER_KEY))
        for key in achieved:
            db.add(Milestone(user_id=user.id, key=key))
        db.commit()
        return []

    existing_keys = {m.key for m in existing}
    new_infos = []
    for key, info in achieved.items():
        if key not in existing_keys:
            db.add(Milestone(user_id=user.id, key=key))
            new_infos.append(info)
    db.commit()
    return new_infos
