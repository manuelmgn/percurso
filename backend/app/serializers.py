"""Common ORM-to-schema builders.

Kept in one place so the same entity renders identically from every
router (trips list, place detail, global search, project doc…)."""
from sqlalchemy.orm import Session, joinedload

from app.models import Place, Project, Trip, User
from app.schemas import PlaceSearchResult, ProjectListResponse, TripListResponse
from app.services import project_service


def to_search_result(place: Place) -> PlaceSearchResult:
    """Cached place in the shape returned by OSM search."""
    return PlaceSearchResult(
        osm_type=place.osm_type,
        osm_id=place.osm_id,
        name=place.name,
        place_type=place.place_type,
        hierarchy=place.hierarchy,
        lat=place.lat,
        lon=place.lon,
        is_cached=True,
    )


def to_trip_list_response(trip: Trip) -> TripListResponse:
    """Compact row used by every listing of trips."""
    return TripListResponse(
        id=trip.id,
        title=trip.title,
        start_date=trip.start_date,
        end_date=trip.end_date,
        visibility=trip.visibility,
        creator_username=trip.creator.username,
        place_count=len(trip.places),
        project_count=len(trip.projects),
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )


def to_project_list_responses(
    db: Session, user: User, projects: list["Project"]
) -> list[ProjectListResponse]:
    """Compact rows used by every listing of projects (progress included).

    Creators and place links are eagerly loaded in one query, then progress
    is computed for every project in two aggregate queries — a 25-project
    list used to fire ~75 queries when each row loaded lazily."""
    if not projects:
        return []
    progress_by_project = project_service.get_progress_by_project(db, user, projects)
    eager = {
        p.id: p
        for p in db.query(Project)
        .options(joinedload(Project.creator), joinedload(Project.places))
        .filter(Project.id.in_([p.id for p in projects]))
        .all()
    }
    return [
        ProjectListResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            visibility=p.visibility,
            creator_username=eager[p.id].creator.username,
            **progress_by_project[p.id],
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in projects
    ]

