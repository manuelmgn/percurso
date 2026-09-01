from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Trip, Project, Place
from app.schemas import SearchResult, TripListResponse, ProjectListResponse, PlaceResponse
from app.services import visibility_service, project_service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/", response_model=SearchResult)
def search(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = f"%{q}%"

    # Search trips
    all_trips = visibility_service.get_visible_trips(db, user)
    matching_trips = [
        t
        for t in all_trips
        if q.lower() in (t.title or "").lower()
        or q.lower() in (t.notes or "").lower()
        or any(q.lower() in tp.place.name.lower() for tp in t.places)
    ]

    # Search projects
    all_projects = visibility_service.get_visible_projects(db, user)
    matching_projects = [p for p in all_projects if q.lower() in p.name.lower() or (p.description and q.lower() in p.description.lower())]

    # Search places
    matching_places = db.query(Place).filter(Place.name.ilike(query)).limit(20).all()

    project_items = []
    for p in matching_projects[:10]:
        progress = project_service.get_project_progress(db, user, p)
        project_items.append(
            ProjectListResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                visibility=p.visibility,
                creator_username=p.creator.username,
                total_places=len(p.places),
                visited_places=progress["visited_places"],
                progress_percent=progress["progress_percent"],
                is_completed=progress["is_completed"],
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
        )

    return SearchResult(
        trips=[
            TripListResponse(
                id=t.id,
                title=t.title,
                start_date=t.start_date,
                end_date=t.end_date,
                visibility=t.visibility,
                creator_username=t.creator.username,
                place_count=len(t.places),
                project_count=len(t.projects),
                created_at=t.created_at,
                updated_at=t.updated_at,
            )
            for t in matching_trips[:10]
        ],
        projects=project_items,
        places=[PlaceResponse.model_validate(p) for p in matching_places],
    )
