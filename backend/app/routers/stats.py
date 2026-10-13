from collections import Counter

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Place
from app.schemas import StatsResponse, StatsSummary, ProjectStat, PlaceRanking, RegionStat
from app.services import visibility_service, project_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/", response_model=StatsResponse)
def get_stats(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trips = visibility_service.get_visible_trips(db, user)
    projects = visibility_service.get_visible_projects(db, user)

    trip_count = len(trips)
    place_ids = set()
    for trip in trips:
        for tp in trip.places:
            place_ids.add(tp.place_id)
    place_count = len(place_ids)

    active_projects = 0
    completed_projects = 0
    project_stats = []
    for p in projects:
        progress = project_service.get_project_progress(db, user, p)
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

    # Region stats
    region_counter = Counter()
    for trip in trips:
        for tp in trip.places:
            place = tp.place
            if place.hierarchy and place.hierarchy.get("region"):
                region_counter[place.hierarchy["region"]] += 1

    region_stats = [RegionStat(region=r, count=c) for r, c in region_counter.most_common()]

    # Most visited places
    place_counter = Counter()
    for trip in trips:
        for tp in trip.places:
            place_counter[tp.place_id] += 1

    most_visited = []
    top_places = place_counter.most_common(10)
    if top_places:
        places_by_id = {
            p.id: p
            for p in db.query(Place).filter(Place.id.in_(place_counter.keys()))
        }
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
            trip_count=trip_count,
            place_count=place_count,
            active_projects=active_projects,
            completed_projects=completed_projects,
        ),
        project_stats=project_stats,
        region_stats=region_stats,
        most_visited=most_visited,
    )
