from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, Place, TripPlace
from app.models.enums import EntityAction, EntityType
from app.schemas import PlaceResponse, PlaceSearchResult, PlaceOverviewItem, PlaceDetailResponse
from app.serializers import to_search_result, to_trip_list_response, to_project_list_responses
from app.services import place_service, activity_service, visibility_service

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("/search", response_model=list[PlaceSearchResult])
async def search_places(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # First check local cache; ranking happens after merging with OSM below
    cached_results = [to_search_result(p) for p in place_service.find_cached_places(db, q, limit=5)]

    # Then fetch from OSM; if Nominatim fails (network, rate limit), serve
    # the cached results instead of erroring out.
    try:
        osm_results = await place_service.search_nominatim(q)
    except Exception:
        osm_results = []

    # Combine (cache first), deduplicate by OSM identity, rank by relevance
    return place_service.merge_dedup_rank(cached_results, place_service.rank_results(osm_results, q), limit=10)


@router.get("/visited", response_model=list[PlaceResponse])
def visited_places(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All distinct places visited by the current user (via trips they can
    see), deduplicated — one entry per place however many times visited."""
    visible_trip_ids = visibility_service.get_visible_trip_ids(db, user)
    if not visible_trip_ids:
        return []
    places = (
        db.query(Place)
        .join(TripPlace, TripPlace.place_id == Place.id)
        .filter(TripPlace.trip_id.in_(visible_trip_ids))
        .distinct()
        .order_by(Place.name)
        .all()
    )
    return places


@router.get("/overview", response_model=list[PlaceOverviewItem])
def places_overview(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Places relevant to the current user — visited (via trips they can see)
    and/or targeted by projects they can see — with visit counts. Read-only:
    places are only created from OSM via trips/projects."""
    return [
        PlaceOverviewItem(
            id=item["place"].id,
            name=item["place"].name,
            place_type=item["place"].place_type,
            hierarchy=item["place"].hierarchy,
            lat=item["place"].lat,
            lon=item["place"].lon,
            visit_count=item["visit_count"],
            last_visited_at=item["last_visited_at"],
            is_project_target=item["is_project_target"],
            updated_at=item["place"].updated_at,
        )
        for item in place_service.get_places_overview(db, user)
    ]


@router.get("/{place_id}", response_model=PlaceDetailResponse)
def get_place(
    place_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    place = place_service.get_place_by_id(db, place_id)
    if not place:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar não encontrado")

    # Only trips/projects the requester can actually see, resolved with SQL
    # joins on the link tables (no full-table fan-out).
    trips = visibility_service.get_trips_for_place(db, user, place.id)
    projects = visibility_service.get_projects_for_place(db, user, place.id)
    sorted_project_rows = to_project_list_responses(
        db, user, sorted(projects, key=lambda p: p.name)
    )

    return PlaceDetailResponse(
        id=place.id,
        osm_type=place.osm_type,
        osm_id=place.osm_id,
        name=place.name,
        place_type=place.place_type,
        hierarchy=place.hierarchy,
        lat=place.lat,
        lon=place.lon,
        polygon=place.polygon,
        created_at=place.created_at,
        updated_at=place.updated_at,
        trips=[
            to_trip_list_response(t)
            for t in sorted(trips, key=lambda t: t.start_date, reverse=True)
        ],
        projects=sorted_project_rows,
    )


@router.post("/import", response_model=PlaceResponse)
async def import_place(
    payload: PlaceSearchResult,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    place, created = place_service.get_or_create_place(
        db,
        osm_type=payload.osm_type,
        osm_id=payload.osm_id,
        name=payload.name,
        place_type=payload.place_type,
        hierarchy=payload.hierarchy,
        lat=payload.lat,
        lon=payload.lon,
        polygon=None,
    )
    place = await place_service.ensure_place_polygon(db, place)
    if created:
        activity_service.log_activity(db, user, EntityAction.CREATED, EntityType.PLACE, place.id, place.name)
    return place


@router.get("/", response_model=list[PlaceResponse])
def list_places(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All places visible to the current user, paginated."""
    visible_ids = place_service.get_visible_place_ids(db, user)
    if not visible_ids:
        return []
    return (
        db.query(Place)
        .filter(Place.id.in_(visible_ids))
        .order_by(Place.name)
        .limit(limit)
        .offset(offset)
        .all()
    )
