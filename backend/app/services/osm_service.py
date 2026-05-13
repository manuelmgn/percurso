import httpx

from app.core.config import get_settings

settings = get_settings()

OSM_TYPE_MAP = {
    "N": "node",
    "W": "way",
    "R": "relation",
}

PLACE_TYPE_KEYWORDS = {
    "building": "building",
    "landmark": "landmark",
    "monument": "monument",
    "parish": "parish",
    "neighbourhood": "neighbourhood",
    "suburb": "neighbourhood",
    "city": "city",
    "town": "town",
    "village": "village",
    "hamlet": "village",
    "municipality": "city",
    "comarca": "comarca",
    "province": "province",
    "state": "region",
    "region": "region",
    "country": "country",
}


def _infer_place_type(nominatim_result: dict) -> str:
    osm_class = nominatim_result.get("class", "")
    osm_type = nominatim_result.get("type", "")
    for key in (osm_type, osm_class):
        if key in PLACE_TYPE_KEYWORDS:
            return PLACE_TYPE_KEYWORDS[key]
    return "landmark"


async def search_nominatim(query: str, country_codes: list[str] | None = None) -> list[dict]:
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
        return response.json()


async def get_osm_details(osm_id: int, osm_type: str) -> dict | None:
    type_prefix = {"node": "N", "way": "W", "relation": "R"}.get(osm_type, "N")
    params = {
        "osmtype": type_prefix,
        "osmid": osm_id,
        "format": "jsonv2",
        "polygon_geojson": 1,
        "addressdetails": 1,
    }
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
    osm_type_raw = result.get("osm_type", "node")[0].upper()
    return {
        "osm_id": int(result.get("osm_id", 0)),
        "osm_type": result.get("osm_type", "node"),
        "name": result.get("name") or result.get("display_name", "")[:500],
        "place_type": _infer_place_type(result),
        "country_code": address.get("country_code", "").upper() or None,
        "region_name": address.get("state") or address.get("region"),
        "centroid_lng": lng,
        "centroid_lat": lat,
        "display_name": result.get("display_name", ""),
    }
