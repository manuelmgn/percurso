from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, Place, PlaceType
from app.schemas import PlaceResponse, PlaceSearchResult, PlaceOverviewItem, PlaceDetailResponse, TripListResponse, ProjectListResponse
from app.services import place_service, project_service, activity_service, visibility_service
from app.models.enums import EntityAction, EntityType

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("/search", response_model=list[PlaceSearchResult])
async def search_places(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # First check local cache
    cached = db.query(Place).filter(Place.name.ilike(f"%{q}%")).limit(5).all()
    cached_results = [
        PlaceSearchResult(
            osm_type=p.osm_type,
            osm_id=p.osm_id,
            name=p.name,
            place_type=p.place_type,
            hierarchy=p.hierarchy,
            lat=p.lat,
            lon=p.lon,
            is_cached=True,
        )
        for p in cached
    ]

    # Then fetch from OSM; if Nominatim fails (network, rate limit), serve
    # the cached results instead of erroring out.
    try:
        osm_results = await place_service.search_nominatim(q)
    except Exception:
        osm_results = []

    # Combine (cache first), deduplicate by OSM identity, rank by relevance
    seen = set()
    results = []
    for r in cached_results + place_service.rank_results(osm_results, q):
        key = (r.osm_type, r.osm_id)
        if key not in seen:
            seen.add(key)
            results.append(r)
    return results[:10]


@router.get("/visited", response_model=list[PlaceResponse])
def visited_places(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """All distinct places visited by the current user (via trips they can
    see), deduplicated — one entry per place however many times visited."""
    visible_trips = visibility_service.get_visible_trips(db, user)
    place_ids = []
    seen = set()
    for trip in visible_trips:
        for tp in trip.places:
            if tp.place_id not in seen:
                seen.add(tp.place_id)
                place_ids.append(tp.place_id)
    if not place_ids:
        return []
    places = db.query(Place).filter(Place.id.in_(place_ids)).all()
    return sorted(places, key=lambda p: p.name)


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

    # Only trips/projects the requester can actually see.
    trips = [
        t for t in visibility_service.get_visible_trips(db, user)
        if any(tp.place_id == place.id for tp in t.places)
    ]
    projects = [
        p for p in visibility_service.get_visible_projects(db, user)
        if any(pp.place_id == place.id for pp in p.places)
    ]

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
            for t in sorted(trips, key=lambda t: t.start_date, reverse=True)
        ],
        projects=[
            ProjectListResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                visibility=p.visibility,
                creator_username=p.creator.username,
                **project_service.get_project_progress(db, user, p),
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in sorted(projects, key=lambda p: p.name)
        ],
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
