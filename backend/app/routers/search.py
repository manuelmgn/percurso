from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Place
from app.schemas import SearchResult, PlaceResponse
from app.serializers import to_trip_list_response, to_project_list_responses
from app.services import visibility_service, place_service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/", response_model=SearchResult)
def search(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = q.lower()

    # Search trips (title, notes and any visited place's name)
    matching_trips = [
        t
        for t in visibility_service.get_visible_trips(db, user)
        if query in (t.title or "").lower()
        or query in (t.notes or "").lower()
        or any(query in tp.place.name.lower() for tp in t.places)
    ]

    # Search projects (name or description)
    matching_projects = [
        p for p in visibility_service.get_visible_projects(db, user)
        if query in p.name.lower()
        or (p.description and query in p.description.lower())
    ]

    # Search places — only those the user can actually see (visited in a
    # visible trip or targeted by a visible project).
    visible_place_ids = place_service.get_visible_place_ids(db, user)
    matching_places = (
        db.query(Place)
        .filter(Place.id.in_(visible_place_ids), Place.name.ilike(f"%{q}%"))
        .limit(20)
        .all()
    ) if visible_place_ids else []

    return SearchResult(
        trips=[to_trip_list_response(t) for t in matching_trips[:10]],
        projects=to_project_list_responses(db, user, matching_projects[:10]),
        places=[PlaceResponse.model_validate(p) for p in matching_places],
    )
