from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
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
        return place

    from geoalchemy2.elements import WKTElement
    centroid_wkt = f"POINT({data['centroid_lng']} {data['centroid_lat']})"

    place = Place(
        osm_id=data["osm_id"],
        osm_type=data["osm_type"],
        name=data["name"],
        place_type=data["place_type"],
        country_code=data.get("country_code"),
        region_name=data.get("region_name"),
        centroid=WKTElement(centroid_wkt, srid=4326),
    )
    db.add(place)
    await db.flush()
    return place


@router.get("/search", response_model=list[PlaceSearchResult])
async def search_places(
    q: str = Query(min_length=2),
    country: str | None = None,
    _current_user: User = Depends(get_current_user),
):
    country_codes = None
    if country:
        country_codes = [c.strip().lower() for c in country.split(",")]
    else:
        country_codes = ["pt", "es"]

    results = await search_nominatim(q, country_codes)
    return [
        PlaceSearchResult(
            osm_id=int(r.get("osm_id", 0)),
            osm_type=r.get("osm_type", "node"),
            name=r.get("name") or r.get("display_name", ""),
            display_name=r.get("display_name", ""),
            place_type=nominatim_to_place_data(r)["place_type"],
            country_code=r.get("address", {}).get("country_code", "").upper() or None,
            centroid_lng=float(r.get("lon", 0)),
            centroid_lat=float(r.get("lat", 0)),
        )
        for r in results
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


@router.get("/{place_id}", response_model=PlaceResponse)
async def get_place(
    place_id: int,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    place = await db.get(Place, place_id)
    if not place:
        raise HTTPException(status_code=404, detail="Local não encontrado")

    if not place.wikipedia_summary:
        cache_key = f"wiki:place:{place.id}"
        result = await fetch_wikipedia_summary(place.name, cache_key)
        if result:
            summary, lang = result
            place.wikipedia_summary = summary
            place.wikipedia_language = lang
            await db.flush()

    return _place_to_response(place)


def _place_to_response(place: Place) -> dict:
    from geoalchemy2.shape import to_shape
    centroid_lng = centroid_lat = None
    if place.centroid is not None:
        try:
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
        "has_polygon": place.geometry is not None,
    }
