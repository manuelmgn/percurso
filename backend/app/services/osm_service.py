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


def nominatim_to_place_data(result: dict) -> dict:
    lng = float(result.get("lon", 0))
    lat = float(result.get("lat", 0))
    address = result.get("address", {})
    return {
        "osm_id": int(result.get("osm_id", 0)),
        "osm_type": result.get("osm_type", "node"),
        "name": result.get("name") or result.get("display_name", "")[:500],
        "place_type": get_place_type(result.get("type", ""), result.get("class", "")),
        "country_code": address.get("country_code", "").upper() or None,
        "region_name": address.get("state") or address.get("region"),
        "centroid_lng": lng,
        "centroid_lat": lat,
        "display_name": result.get("display_name", ""),
    }
