from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
from app.core.limiter import limiter
from app.core.place_types import PLACE_TYPE_CATEGORY, PLACE_TYPE_LABELS
from app.models.place import Place
from app.models.user import User
from app.schemas.place import PlaceResponse, PlaceSearchResult
from app.services.osm_service import get_osm_details, nominatim_to_place_data, search_nominatim
from app.services.wikipedia_service import fetch_wikipedia_summary

router = APIRouter(prefix="/places", tags=["places"])

_VALID_OSM_TYPES = {"node", "way", "relation"}


async def _upsert_place(db: AsyncSession, data: dict) -> Place:
    result = await db.execute(
        select(Place).where(
            Place.osm_id == data["osm_id"],
            Place.osm_type == data["osm_type"],
        )
    )
    place = result.scalar_one_or_none()
    if place:
        dirty = False
        # Fill float coordinates if missing (e.g. places imported before migration 0012)
        if place.centroid_lat is None and data.get("centroid_lat") is not None:
            place.centroid_lat = data["centroid_lat"]
            dirty = True
        if place.centroid_lng is None and data.get("centroid_lng") is not None:
            place.centroid_lng = data["centroid_lng"]
            dirty = True
        # Fill polygon geometry if now available and not yet stored
        if data.get("geometry_geojson") and place.geometry_geojson is None:
            place.geometry_geojson = data["geometry_geojson"]
            dirty = True
        # Fill metadata fields if previously absent
        if place.addresstype is None and data.get("addresstype"):
            place.addresstype = data["addresstype"]
            dirty = True
        if place.osm_class is None and data.get("osm_class"):
            place.osm_class = data["osm_class"]
            dirty = True
        if place.display_name is None and data.get("display_name"):
            place.display_name = data["display_name"]
            dirty = True
        if dirty:
            await db.flush()
        return place

    from geoalchemy2.elements import WKTElement
    centroid_wkt = f"POINT({data['centroid_lng']} {data['centroid_lat']})"

    place = Place(
        osm_id=data["osm_id"],
        osm_type=data["osm_type"],
        osm_class=data.get("osm_class"),
        addresstype=data.get("addresstype"),
        name=data["name"],
        display_name=data.get("display_name"),
        place_type=data["place_type"],
        country_code=data.get("country_code"),
        region_name=data.get("region_name"),
        centroid_lat=data.get("centroid_lat"),
        centroid_lng=data.get("centroid_lng"),
        centroid=WKTElement(centroid_wkt, srid=4326),
        geometry_geojson=data.get("geometry_geojson"),
    )
    db.add(place)
    await db.flush()
    return place


@router.get("/search", response_model=list[PlaceSearchResult])
@limiter.limit("30/minute")
async def search_places(
    request: Request,
    q: str = Query(min_length=2),
    country: str | None = None,
    _current_user: User = Depends(get_current_user),
):
    country_codes = None
    if country:
        country_codes = [c.strip().lower() for c in country.split(",")]
    else:
        country_codes = ["pt", "es"]

    raw = await search_nominatim(q, country_codes)

    # Deduplicate by osm_id only — same OSM object may appear twice.
    seen: dict[int, dict] = {}
    for r in raw:
        data = nominatim_to_place_data(r)
        osm_id = data["osm_id"]
        if osm_id not in seen:
            seen[osm_id] = data

    ordered = sorted(seen.values(), key=lambda d: d.get("importance") or 0.0, reverse=True)

    return [
        PlaceSearchResult(
            osm_id=d["osm_id"],
            osm_type=d["osm_type"],
            osm_class=d.get("osm_class", ""),
            name=d["name"],
            display_name=d["display_name"],
            place_type=d["place_type"],
            place_type_label=PLACE_TYPE_LABELS.get(d["place_type"], d["place_type"]),
            place_category=PLACE_TYPE_CATEGORY.get(d["place_type"], "outro"),
            country_code=d["country_code"],
            centroid_lng=d["centroid_lng"],
            centroid_lat=d["centroid_lat"],
            importance=d.get("importance"),
            addresstype=d.get("addresstype", ""),
            admin_level=d.get("admin_level"),
        )
        for d in ordered
    ]


@router.post("/import", response_model=PlaceResponse, status_code=201)
async def import_place(
    osm_id: int,
    osm_type: str,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if osm_type not in _VALID_OSM_TYPES:
        raise HTTPException(status_code=400, detail=f"osm_type inválido. Aceites: {', '.join(sorted(_VALID_OSM_TYPES))}")

    result = await get_osm_details(osm_id, osm_type)
    if not result:
        raise HTTPException(status_code=404, detail="Local não encontrado no OSM")
    data = nominatim_to_place_data(result)
    place = await _upsert_place(db, data)
    return _place_to_response(place)


@router.get("/{osm_id}", response_model=PlaceResponse)
async def get_place(
    osm_id: int,
    osm_type: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    from app.models.trip import Trip, TripCompanion, TripPlace
    from sqlalchemy import or_, and_

    q = select(Place).where(Place.osm_id == osm_id)
    if osm_type is not None:
        if osm_type not in _VALID_OSM_TYPES:
            raise HTTPException(status_code=400, detail=f"osm_type inválido. Aceites: {', '.join(sorted(_VALID_OSM_TYPES))}")
        q = q.where(Place.osm_type == osm_type)
    result = await db.execute(q.order_by(Place.id).limit(1))
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Local não encontrado")

    # Opportunistically backfill polygon geometry for territory types that lack it.
    # Mirrors the Wikipedia lazy-fetch pattern.
    _TERRITORY_TYPES = {"pais", "regiao", "provincia", "comarca", "bairro", "limite"}
    if place.place_type in _TERRITORY_TYPES and place.geometry_geojson is None:
        try:
            detail = await get_osm_details(place.osm_id, place.osm_type)
            if detail:
                from app.services.osm_service import nominatim_to_place_data
                data = nominatim_to_place_data(detail)
                if data.get("geometry_geojson"):
                    place.geometry_geojson = data["geometry_geojson"]
                if place.centroid_lat is None and data.get("centroid_lat"):
                    place.centroid_lat = data["centroid_lat"]
                if place.centroid_lng is None and data.get("centroid_lng"):
                    place.centroid_lng = data["centroid_lng"]
                await db.flush()
        except Exception:
            pass  # Nominatim may be unavailable; non-fatal

    if not place.wikipedia_summary:
        cache_key = f"wiki:place:{place.id}"
        wiki = await fetch_wikipedia_summary(place.name, cache_key)
        if wiki:
            summary, lang = wiki
            place.wikipedia_summary = summary
            place.wikipedia_language = lang
            await db.flush()

    # Trips containing this place that the current user can see
    trips_result = await db.execute(
        select(Trip.id, Trip.title, Trip.start_date, Trip.end_date)
        .join(TripPlace, TripPlace.trip_id == Trip.id)
        .outerjoin(
            TripCompanion,
            and_(
                TripCompanion.trip_id == Trip.id,
                TripCompanion.user_id == current_user.id,
                TripCompanion.status == "accepted",
            ),
        )
        .where(
            TripPlace.place_id == place.id,
            or_(
                Trip.creator_id == current_user.id,
                TripCompanion.id.isnot(None),
            ),
        )
        .distinct()
        .order_by(Trip.start_date.asc().nullslast())
    )
    place_trips = [
        {"id": r.id, "title": r.title, "start_date": r.start_date, "end_date": r.end_date}
        for r in trips_result.all()
    ]

    response = _place_to_response(place)
    response["place_trips"] = place_trips
    return response


def _place_to_response(place: Place) -> dict:
    # Prefer pre-computed float columns; fall back to PostGIS extraction for old rows
    centroid_lng = place.centroid_lng
    centroid_lat = place.centroid_lat
    if centroid_lng is None and place.centroid is not None:
        try:
            from geoalchemy2.shape import to_shape
            pt = to_shape(place.centroid)
            centroid_lng, centroid_lat = pt.x, pt.y
        except Exception:
            pass

    return {
        "id": place.id,
        "osm_id": place.osm_id,
        "osm_type": place.osm_type,
        "name": place.name,
        "name_pt": place.name_pt,
        "place_type": place.place_type,
        "country_code": place.country_code,
        "region_name": place.region_name,
        "wikipedia_summary": place.wikipedia_summary,
        "wikipedia_language": place.wikipedia_language,
        "wikipedia_title": place.wikipedia_title,
        "centroid_lng": centroid_lng,
        "centroid_lat": centroid_lat,
        "has_polygon": place.geometry_geojson is not None or place.geometry is not None,
        "geometry_geojson": place.geometry_geojson,
    }
