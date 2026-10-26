from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Place, TripPlace
from app.schemas import StatsResponse, StatsSummary, ProjectStat, PlaceRanking, RegionStat
from app.services import visibility_service, project_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # One aggregate query for every (trip, place) link the user may see —
    # this endpoint used to traverse trip.places per trip and re-run the
    # visibility check per project.
    place_ids: set[int] = set()
    place_occurrences: Counter[int] = Counter()
    region_counter: Counter[str] = Counter()

    trip_ids = visibility_service.get_visible_trip_ids(db, user)
    if trip_ids:
        link_rows = (
            db.query(TripPlace.place_id, Place.hierarchy)
            .join(Place, Place.id == TripPlace.place_id)
            .filter(TripPlace.trip_id.in_(trip_ids))
            .all()
        )
        for place_id, hierarchy in link_rows:
            place_ids.add(place_id)
            place_occurrences[place_id] += 1
            region = (hierarchy or {}).get("region")
            if region:
                region_counter[region] += 1

    # Project progress in two aggregate queries instead of per-project.
    projects = visibility_service.get_visible_projects(db, user)
    progress_by_project = project_service.get_progress_by_project(db, user, projects)

    active_projects = completed_projects = 0
    project_stats = []
    for p in projects:
        progress = progress_by_project[p.id]
        if progress["is_completed"]:
            completed_projects += 1
        else:
            active_projects += 1
        project_stats.append(ProjectStat(
            project_id=p.id,
            project_name=p.name,
            progress_percent=progress["progress_percent"],
            visited_places=progress["visited_places"],
            total_places=progress["total_places"],
        ))

    region_stats = [RegionStat(region=r, count=c) for r, c in region_counter.most_common()]

    # Most visited places: top 10 occurrences, with place rows fetched in
    # a single query for just those 10 IDs.
    most_visited = []
    top_places = place_occurrences.most_common(10)
    places_by_id = {
        p.id: p for p in db.query(Place).filter(Place.id.in_([pid for pid, _ in top_places]))
    } if top_places else {}
    for place_id, count in top_places:
        place = places_by_id.get(place_id)
        if place:
            most_visited.append(PlaceRanking(
                place_id=place.id,
                place_name=place.name,
                place_type=place.place_type,
                visit_count=count,
            ))

    return StatsResponse(
        summary=StatsSummary(
            trip_count=len(trip_ids),
            place_count=len(place_ids),
            active_projects=active_projects,
            completed_projects=completed_projects,
        ),
        project_stats=project_stats,
        region_stats=region_stats,
        most_visited=most_visited,
    )
