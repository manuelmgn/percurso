"""Common ORM-to-schema builders.

Kept in one place so the same entity renders identically from every
router (trips list, place detail, global search, project doc…)."""
from typing import Collection, Optional

from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models import Place, Project, Trip, User
from app.schemas import PlaceSearchResult, ProjectListResponse, TripListResponse
from app.services import project_service, visibility_service


def resolve_cover_photo_url(trip: Trip) -> Optional[str]:
    """Effective cover URL for a trip: uploaded cover photo first, then an
    Immich cover asset (only while the Immich server and the album owner's
    API key are configured so cards fall back cleanly otherwise)."""
    if trip.cover_photo:
        return trip.cover_photo.url
    if trip.cover_immich_asset_id and settings.immich_server_configured:
        owner = trip.immich_owner or trip.creator
        if owner and owner.immich_api_key:
            return f"/api/immich/trips/{trip.id}/assets/{trip.cover_immich_asset_id}/thumbnail?size=preview"
    return None


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


def to_trip_list_response(
    trip: Trip,
    visible_project_ids: Optional[Collection[int]] = None,
) -> TripListResponse:
    """Compact row used by every listing of trips."""
    links = [
        tp for tp in trip.projects
        if visible_project_ids is None or tp.project_id in visible_project_ids
    ]
    project_count = len(links)
    return TripListResponse(
        id=trip.id,
        title=trip.title,
        start_date=trip.start_date,
        end_date=trip.end_date,
        visibility=trip.visibility,
        creator_username=trip.creator.username,
        place_count=len(trip.places),
        project_count=project_count,
        projects=[{"id": tp.project_id, "name": tp.project.name} for tp in links],
        cover_photo_url=resolve_cover_photo_url(trip),
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )


def to_trip_list_responses(
    db: Session, user: User, trips: list[Trip]
) -> list[TripListResponse]:
    """Compact rows for a list of trips, counting only projects the requester
    is allowed to see so hidden projects are never leaked through project_count."""
    if not trips:
        return []
    visible_project_ids = (
        visibility_service.get_visible_project_ids(db, user)
        if any(t.projects for t in trips)
        else set()
    )
    return [to_trip_list_response(t, visible_project_ids) for t in trips]


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

