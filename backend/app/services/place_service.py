import asyncio
import time

import httpx
from typing import Optional
from sqlalchemy.orm import Session

from app.models import Place, PlaceType
from app.schemas import PlaceSearchResult
from app.services import visibility_service

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_LOOKUP_URL = "https://nominatim.openstreetmap.org/lookup"
USER_AGENT = "Percursos/0.1 (https://github.com/manuelmgn/percurso)"

# Nominatim usage policy: max 1 request/second. Serialise and pace all
# outbound requests through this lock.
_nominatim_lock = asyncio.Lock()
_last_nominatim_request = 0.0


async def _throttle_nominatim() -> None:
    global _last_nominatim_request
    async with _nominatim_lock:
        wait = 1.05 - (time.monotonic() - _last_nominatim_request)
        if wait > 0:
            await asyncio.sleep(wait)
        _last_nominatim_request = time.monotonic()


def map_osm_tags_to_type(extratags: dict, osm_class: str, osm_type: str) -> PlaceType:
    if osm_class == "boundary" and osm_type == "administrative":
        admin_level = extratags.get("admin_level")
        if admin_level == "2":
            return PlaceType.COUNTRY
        if admin_level == "4":
            return PlaceType.REGION
        if admin_level == "6":
            return PlaceType.PROVINCE
        if admin_level == "7":
            return PlaceType.COMARCA
        if admin_level == "8":
            return PlaceType.MUNICIPALITY
        if admin_level == "9":
            return PlaceType.PARISH

    if osm_class == "place":
        if osm_type in ("city", "town"):
            return PlaceType.TOWN
        if osm_type in ("village", "hamlet", "isolated_dwelling", "locality"):
            return PlaceType.VILLAGE
        if osm_type == "square":
            return PlaceType.STREET

    if osm_class == "highway" and osm_type in ("pedestrian", "footway"):
        return PlaceType.STREET

    if extratags.get("tourism") == "attraction" or extratags.get("historic") == "monument" or osm_class == "building":
        return PlaceType.BUILDING

    return PlaceType.OTHER


def build_hierarchy(display_name: str, address: dict) -> dict:
    hierarchy = {}
    if address.get("country"):
        hierarchy["country"] = address["country"]
    if address.get("state"):
        hierarchy["region"] = address["state"]
    if address.get("province"):
        hierarchy["province"] = address["province"]
    if address.get("county"):
        hierarchy["comarca"] = address["county"]
    if address.get("city") or address.get("town") or address.get("municipality"):
        hierarchy["municipality"] = address.get("city") or address.get("town") or address.get("municipality")
    if address.get("village") or address.get("hamlet"):
        hierarchy["village"] = address.get("village") or address.get("hamlet")
    return hierarchy


async def search_nominatim(query: str, limit: int = 15) -> list[PlaceSearchResult]:
    await _throttle_nominatim()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "json",
                "limit": limit,
                "addressdetails": 1,
                "extratags": 1,
            },
            headers={"User-Agent": USER_AGENT},
            timeout=10.0,
        )
        response.raise_for_status()
        data = response.json()

    results = []
    for item in data:
        place_class = item.get("class", "")
        place_type = map_osm_tags_to_type(item.get("extratags") or {}, place_class, item.get("type", ""))
        results.append(
            PlaceSearchResult(
                osm_type=item.get("osm_type", "node"),
                osm_id=item.get("osm_id", 0),
                name=item.get("display_name", "").split(",")[0],
                place_type=place_type,
                hierarchy=build_hierarchy(item.get("display_name", ""), item.get("address") or {}),
                lat=float(item.get("lat", 0)),
                lon=float(item.get("lon", 0)),
                is_cached=False,
            )
        )
    return results


def rank_results(results: list[PlaceSearchResult], query: str) -> list[PlaceSearchResult]:
    """Order results by relevance to the raw query: name prefix matches first,
    then substring matches, then the rest (stable within each group)."""
    q = query.strip().lower()

    def score(r: PlaceSearchResult) -> int:
        name = r.name.lower()
        if name.startswith(q):
            return 0
        if q in name:
            return 1
        return 2

    return sorted(results, key=score)


def get_or_create_place(
    db: Session,
    osm_type: str,
    osm_id: int,
    name: str,
    place_type: PlaceType,
    hierarchy: Optional[dict],
    lat: float,
    lon: float,
    polygon: Optional[dict] = None,
) -> tuple[Place, bool]:
    """Return the place and whether it was created (False when it already
    existed in the local cache)."""
    place = (
        db.query(Place)
        .filter(Place.osm_type == osm_type, Place.osm_id == osm_id)
        .first()
    )
    if place:
        return place, False

    place = Place(
        osm_type=osm_type,
        osm_id=osm_id,
        name=name,
        place_type=place_type,
        hierarchy=hierarchy,
        lat=lat,
        lon=lon,
        polygon=polygon,
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return place, True


def get_place_by_id(db: Session, place_id: int) -> Optional[Place]:
    return db.query(Place).filter(Place.id == place_id).first()


def get_places_overview(db: Session, user) -> list[dict]:
    """Places relevant to the user: visited (via visible trips) and/or
    targeted by visible projects, with visit counts and last visit date."""
    visit_count: dict[int, int] = {}
    last_visited: dict[int, object] = {}
    for trip in visibility_service.get_visible_trips(db, user):
        visit_date = trip.end_date or trip.start_date
        for tp in trip.places:
            visit_count[tp.place_id] = visit_count.get(tp.place_id, 0) + 1
            if tp.place_id not in last_visited or visit_date > last_visited[tp.place_id]:
                last_visited[tp.place_id] = visit_date

    target_ids: set[int] = set()
    for project in visibility_service.get_visible_projects(db, user):
        for project_place in project.places:
            target_ids.add(project_place.place_id)

    relevant_ids = set(visit_count) | target_ids
    if not relevant_ids:
        return []

    places = db.query(Place).filter(Place.id.in_(relevant_ids)).all()
    return [
        {
            "place": place,
            "visit_count": visit_count.get(place.id, 0),
            "last_visited_at": last_visited.get(place.id),
            "is_project_target": place.id in target_ids,
        }
        for place in sorted(places, key=lambda p: p.name)
    ]


def list_places(db: Session, limit: int = 100, offset: int = 0) -> list[Place]:
    return db.query(Place).order_by(Place.name).limit(limit).offset(offset).all()


def get_visible_place_ids(db: Session, user) -> set[int]:
    """Return IDs of places the user can see (visited in visible trips
    and/or targeted by visible projects)."""
    visible_ids: set[int] = set()
    for trip in visibility_service.get_visible_trips(db, user):
        for tp in trip.places:
            visible_ids.add(tp.place_id)
    for project in visibility_service.get_visible_projects(db, user):
        for pp in project.places:
            visible_ids.add(pp.place_id)
    return visible_ids


# --- Boundary polygons ---

# Simplification tolerance in degrees (~200 m). Aggressive enough to keep
# payloads small for the map, gentle enough to recognise the shape.
_SIMPLIFY_TOLERANCE = 0.002

_OSM_TYPE_PREFIX = {"node": "N", "way": "W", "relation": "R"}


def _perpendicular_distance(point, start, end) -> float:
    """Distance from point to the start-end segment (planar, degrees)."""
    (px, py), (x1, y1), (x2, y2) = point, start, end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
    proj_x, proj_y = x1 + t * dx, y1 + t * dy
    return ((px - proj_x) ** 2 + (py - proj_y) ** 2) ** 0.5


def _douglas_peucker(points: list, tolerance: float) -> list:
    if len(points) < 3:
        return points
    max_dist, index = 0.0, 0
    for i in range(1, len(points) - 1):
        dist = _perpendicular_distance(points[i], points[0], points[-1])
        if dist > max_dist:
            max_dist, index = dist, i
    if max_dist <= tolerance:
        return [points[0], points[-1]]
    left = _douglas_peucker(points[: index + 1], tolerance)
    right = _douglas_peucker(points[index:], tolerance)
    return left[:-1] + right


def simplify_geojson(geometry: Optional[dict], tolerance: float = _SIMPLIFY_TOLERANCE) -> Optional[dict]:
    """Simplify a GeoJSON Polygon/MultiPolygon with Douglas-Peucker."""
    if not geometry:
        return None
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype not in ("Polygon", "MultiPolygon") or not coords:
        return None

    def simplify_polygon(rings):
        simplified = []
        for ring in rings:
            if len(ring) > 4:
                ring = _douglas_peucker([tuple(p[:2]) for p in ring], tolerance)
            if len(ring) >= 4:
                simplified.append([[round(x, 5), round(y, 5)] for x, y in ring])
        return simplified or None

    if gtype == "Polygon":
        result = simplify_polygon(coords)
        return {"type": "Polygon", "coordinates": result} if result else None

    polygons = []
    for polygon in coords:
        result = simplify_polygon(polygon)
        if result:
            polygons.append(result)
    return {"type": "MultiPolygon", "coordinates": polygons} if polygons else None


async def fetch_place_polygon(osm_type: str, osm_id: int) -> Optional[dict]:
    """Fetch and simplify the boundary polygon from Nominatim lookup.
    Nodes have no polygon; ways/relations may."""
    prefix = _OSM_TYPE_PREFIX.get(osm_type)
    if prefix is None or prefix == "N":
        return None
    await _throttle_nominatim()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            NOMINATIM_LOOKUP_URL,
            params={"osm_ids": f"{prefix}{osm_id}", "format": "json", "polygon_geojson": 1},
            headers={"User-Agent": USER_AGENT},
            timeout=20.0,
        )
        response.raise_for_status()
        data = response.json()
    if not data:
        return None
    return simplify_geojson(data[0].get("geojson"))


async def ensure_place_polygon(db: Session, place: Place) -> Place:
    """Populate place.polygon if missing. Failures are non-fatal."""
    if place.polygon is not None:
        return place
    try:
        polygon = await fetch_place_polygon(place.osm_type, place.osm_id)
    except Exception:
        polygon = None
    if polygon is not None:
        place.polygon = polygon
        db.commit()
        db.refresh(place)
    return place
