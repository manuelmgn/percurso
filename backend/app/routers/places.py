from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user
from app.models import User, Place, PlaceType
from app.schemas import PlaceResponse, PlaceSearchResult
from app.services import place_service, activity_service, visibility_service
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


@router.get("/{place_id}", response_model=PlaceResponse)
def get_place(
    place_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    place = place_service.get_place_by_id(db, place_id)
    if not place:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar não encontrado")
    return place


@router.post("/import", response_model=PlaceResponse)
async def import_place(
    payload: PlaceSearchResult,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    place = place_service.get_or_create_place(
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
    activity_service.log_activity(db, user, EntityAction.CREATED, EntityType.PLACE, place.id, place.name)
    return place


@router.get("/", response_model=list[PlaceResponse])
def list_places(
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return place_service.list_places(db, limit=limit, offset=offset)
