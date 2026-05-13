import httpx

from app.core.redis import get_redis

LANGUAGE_PRIORITY = ["pt", "gl", "en", "es"]
WIKIPEDIA_API = "https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
SEARCH_API = "https://{lang}.wikipedia.org/w/api.php"


async def fetch_wikipedia_summary(place_name: str, cache_key: str) -> tuple[str, str] | None:
    """
    Returns (summary_text, language_code) or None if not found.
    Checks Redis cache first. Language priority: pt → gl → en → es.
    """
    redis = await get_redis()
    cached = await redis.get(cache_key)
    if cached:
        lang, summary = cached.split("|", 1)
        return summary, lang

    for lang in LANGUAGE_PRIORITY:
        result = await _search_wikipedia(lang, place_name)
        if result:
            summary, lang_code = result
            ttl = 604800  # 7 days
            await redis.setex(cache_key, ttl, f"{lang_code}|{summary}")
            return summary, lang_code
    return None


async def _search_wikipedia(lang: str, query: str) -> tuple[str, str] | None:
    params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "format": "json",
        "srlimit": 1,
    }
    headers = {"User-Agent": "Percurso/1.0 (travel app)"}
    async with httpx.AsyncClient(timeout=8.0) as client:
        try:
            search_resp = await client.get(
                SEARCH_API.format(lang=lang), params=params, headers=headers
            )
            search_resp.raise_for_status()
            data = search_resp.json()
            results = data.get("query", {}).get("search", [])
            if not results:
                return None

            title = results[0]["title"]
            summary_url = WIKIPEDIA_API.format(lang=lang, title=title.replace(" ", "_"))
            summary_resp = await client.get(summary_url, headers=headers)
            if summary_resp.status_code != 200:
                return None

            summary_data = summary_resp.json()
            extract = summary_data.get("extract", "").strip()
            if not extract:
                return None
            return extract[:2000], lang
        except (httpx.HTTPError, KeyError, ValueError):
            return None
