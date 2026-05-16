import json
import hashlib

import httpx

from app.core.config import get_settings
from app.core.place_types import get_place_type

settings = get_settings()

OSM_TYPE_MAP = {
    "N": "node",
    "W": "way",
    "R": "relation",
}

_NOMINATIM_CACHE_TTL = 3600  # 1 hour


def _search_cache_key(query: str, country_codes: list[str] | None) -> str:
    raw = f"{query}:{','.join(sorted(country_codes or []))}"
    return f"nominatim:search:{hashlib.md5(raw.encode()).hexdigest()}"


async def search_nominatim(query: str, country_codes: list[str] | None = None) -> list[dict]:
    from app.core.redis import get_redis
    redis = await get_redis()
    cache_key = _search_cache_key(query, country_codes)
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    params: dict = {
        "q": query,
        "format": "jsonv2",
        "limit": 10,
        "addressdetails": 1,
        "extratags": 1,
    }
    if country_codes:
        params["countrycodes"] = ",".join(country_codes)

    headers = {
        "User-Agent": f"Percurso/1.0 ({settings.osm_user_agent_email})",
        "Accept-Language": "pt,en",
    }
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{settings.nominatim_base_url}/search", params=params, headers=headers
        )
        response.raise_for_status()
        results = response.json()

    await redis.setex(cache_key, _NOMINATIM_CACHE_TTL, json.dumps(results))
    return results


async def get_osm_details(osm_id: int, osm_type: str) -> dict | None:
    type_prefix = {"node": "N", "way": "W", "relation": "R"}.get(osm_type, "N")
    headers = {
        "User-Agent": f"Percurso/1.0 ({settings.osm_user_agent_email})",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{settings.nominatim_base_url}/lookup",
            params={"osm_ids": f"{type_prefix}{osm_id}", "format": "jsonv2", "polygon_geojson": 1},
            headers=headers,
        )
        response.raise_for_status()
        results = response.json()
        return results[0] if results else None


def _parse_admin_level(result: dict) -> int | None:
    extratags = result.get("extratags") or {}
    raw = result.get("admin_level") or extratags.get("admin_level")
    try:
        return int(raw) if raw is not None else None
    except (ValueError, TypeError):
        return None


def nominatim_to_place_data(result: dict) -> dict:
    lng = float(result.get("lon", 0))
    lat = float(result.get("lat", 0))
    address = result.get("address", {})
    # jsonv2 format (used by /search) returns "category"; json format and /lookup return "class"
    osm_class = result.get("category") or result.get("class", "")
    osm_type_val = result.get("type", "")
    addresstype = result.get("addresstype", "")
    admin_level = _parse_admin_level(result)
    place_type = get_place_type(osm_class, osm_type_val, addresstype, admin_level)

    # Extract polygon GeoJSON when available (present in /lookup with polygon_geojson=1)
    geojson = result.get("geojson")
    geometry_geojson = None
    if geojson and geojson.get("type") not in ("Point", "MultiPoint", None):
        geometry_geojson = geojson

    return {
        "osm_id": int(result.get("osm_id", 0)),
        "osm_type": result.get("osm_type", "node"),
        "osm_class": osm_class,
        "name": result.get("name") or result.get("display_name", "")[:500],
        "place_type": place_type,
        "country_code": address.get("country_code", "").upper() or None,
        "region_name": address.get("state") or address.get("region"),
        "centroid_lng": lng,
        "centroid_lat": lat,
        "display_name": result.get("display_name", "")[:1000],
        "importance": result.get("importance"),
        "addresstype": addresstype,
        "admin_level": admin_level,
        "geometry_geojson": geometry_geojson,
    }
