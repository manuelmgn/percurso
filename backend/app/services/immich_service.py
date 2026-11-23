"""Proxy client for an optional self-hosted Immich instance.

All API calls and image fetches go through the backend so the Immich API key
never leaves the server and Percurso's session + trip visibility rules apply
uniformly.
"""

import re
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status

from app.config import settings

_ID_RE = re.compile(r"^[a-zA-Z0-9-]{1,64}$")
_ALBUM_PATH_RE = re.compile(r"/albums/([a-zA-Z0-9-]{1,64})(?:/|$)")

# Shared pooled client so parallel thumbnail requests reuse connections to
# Immich instead of opening a fresh TCP socket per image.
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def is_valid_id(value: str) -> bool:
    return bool(_ID_RE.match(value))


def _require_enabled() -> tuple[str, dict[str, str]]:
    if not settings.immich_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração com o Immich não configurada",
        )
    base = settings.immich_url.strip().rstrip("/")
    headers = {
        "x-api-key": settings.immich_api_key.strip(),
        "Accept": "application/json",
    }
    return base, headers


def public_base_url() -> Optional[str]:
    raw = (settings.immich_public_url or settings.immich_url).strip().rstrip("/")
    return raw or None


def public_album_url(album_id: str) -> Optional[str]:
    base = public_base_url()
    return f"{base}/albums/{album_id}" if base else None


def extract_album_from_links(external_links: Optional[list[dict]]) -> tuple[Optional[str], Optional[str]]:
    """Fallback: if a trip has no explicit immich_album_id, inspect its Immich
    external links for an `/albums/<id>` URL so pasted links work too.
    Returns (album_id, original_url)."""
    if not external_links:
        return None, None
    for link in external_links:
        if not isinstance(link, dict) or link.get("type") != "immich":
            continue
        url = (link.get("url") or "").strip()
        try:
            path = urlparse(url).path
        except ValueError:
            continue
        match = _ALBUM_PATH_RE.search(path)
        if match:
            return match.group(1), url
    return None, None


def _raise_for_immich_status(response: httpx.Response, not_found_detail: str) -> None:
    if response.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=not_found_detail)
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Chave API do Immich inválida ou sem permissões",
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="O servidor Immich devolveu um erro inesperado",
        )


def _parse_json(response: httpx.Response):
    try:
        return response.json()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Resposta inválida do servidor Immich",
        )


async def list_albums() -> list[dict]:
    base, headers = _require_enabled()
    client = _get_client()
    try:
        owned_res = await client.get(f"{base}/api/albums", headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contactar o servidor Immich",
        )
    _raise_for_immich_status(owned_res, "Álbum não encontrado no Immich")
    raw_albums = list(_parse_json(owned_res))

    # Also include albums shared with the API key's user (best-effort so older
    # Immich versions or restricted keys still return owned albums).
    try:
        shared_res = await client.get(f"{base}/api/albums", params={"shared": "true"}, headers=headers)
        if shared_res.status_code == 200:
            shared_data = shared_res.json()
            if isinstance(shared_data, list):
                raw_albums.extend(shared_data)
    except (httpx.RequestError, ValueError):
        pass

    seen: set[str] = set()
    albums = []
    for item in raw_albums:
        if not isinstance(item, dict):
            continue
        album_id = item.get("id")
        if not album_id or not is_valid_id(str(album_id)):
            continue
        album_id_str = str(album_id)
        if album_id_str in seen:
            continue
        seen.add(album_id_str)
        thumb_id = item.get("albumThumbnailAssetId")
        thumbnail_url = (
            f"/api/immich/assets/{thumb_id}/thumbnail?size=thumbnail"
            if thumb_id and is_valid_id(str(thumb_id))
            else None
        )
        albums.append(
            {
                "id": album_id_str,
                "name": item.get("albumName") or "Sem título",
                "asset_count": int(item.get("assetCount") or 0),
                "start_date": item.get("startDate"),
                "end_date": item.get("endDate"),
                "thumbnail_url": thumbnail_url,
            }
        )

    # Dated albums newest-first, then dateless albums A-Z.
    dated = sorted(
        (a for a in albums if a.get("start_date")),
        key=lambda a: (a["start_date"], a["name"].lower()),
        reverse=True,
    )
    undated = sorted(
        (a for a in albums if not a.get("start_date")),
        key=lambda a: a["name"].lower(),
    )
    return dated + undated


async def _fetch_album_assets_via_search(
    client: httpx.AsyncClient,
    base: str,
    headers: dict[str, str],
    album_id: str,
    order: str,
) -> list[dict]:
    """Immich v3+ omits `assets` from GET /api/albums/{id}; fetch them via
    POST /api/search/metadata with pagination (capped at 10 pages / 10k items)."""
    items: list[dict] = []
    page = 1
    max_pages = 10
    sort_order = order if order in ("asc", "desc") else "asc"
    while page <= max_pages:
        payload = {
            "albumIds": [album_id],
            "type": "IMAGE",
            "withExif": True,
            "order": sort_order,
            "size": 1000,
            "page": page,
        }
        try:
            response = await client.post(f"{base}/api/search/metadata", json=payload, headers=headers)
        except httpx.RequestError:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Não foi possível contactar o servidor Immich",
            )
        _raise_for_immich_status(response, "Álbum não encontrado no Immich")
        body = _parse_json(response)
        assets_block = body.get("assets") if isinstance(body, dict) else None
        if not isinstance(assets_block, dict):
            break
        page_items = assets_block.get("items") or []
        if not page_items:
            break
        items.extend(page_items)
        next_page = assets_block.get("nextPage")
        if not next_page:
            break
        try:
            next_page_int = int(next_page)
        except (TypeError, ValueError):
            break
        if next_page_int <= page:
            break
        page = next_page_int
    return items


async def get_album(album_id: str, external_url_override: Optional[str] = None) -> dict:
    if not is_valid_id(album_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de álbum Immich inválido")
    base, headers = _require_enabled()
    client = _get_client()
    try:
        response = await client.get(f"{base}/api/albums/{album_id}", headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contactar o servidor Immich",
        )
    _raise_for_immich_status(response, "Álbum não encontrado no Immich")
    data = _parse_json(response)

    raw_assets = data.get("assets")
    expected_count = int(data.get("assetCount") or 0)
    if raw_assets is None or (len(raw_assets) == 0 and expected_count > 0):
        raw_assets = await _fetch_album_assets_via_search(
            client, base, headers, album_id, str(data.get("order") or "asc")
        )

    assets = []
    for item in raw_assets or []:
        if not isinstance(item, dict):
            continue
        asset_id = item.get("id")
        if not asset_id or not is_valid_id(str(asset_id)):
            continue
        # Only image assets can be rendered in the photo grid/lightbox.
        asset_type = item.get("type")
        if asset_type and asset_type != "IMAGE":
            continue
        exif = item.get("exifInfo") or {}
        caption = (exif.get("description") or "").strip() or None
        assets.append(
            {
                "id": str(asset_id),
                "thumbnail_url": f"/api/immich/assets/{asset_id}/thumbnail?size=thumbnail",
                "preview_url": f"/api/immich/assets/{asset_id}/thumbnail?size=preview",
                "caption": caption,
                "taken_at": exif.get("dateTimeOriginal") or item.get("fileCreatedAt"),
                "lat": exif.get("latitude"),
                "lon": exif.get("longitude"),
                "width": exif.get("exifImageWidth"),
                "height": exif.get("exifImageHeight"),
                "filename": item.get("originalFileName"),
            }
        )

    # Prefer explicit PERCURSOS_IMMICH_PUBLIC_URL, then the URL pasted in
    # external_links (if any), then PERCURSOS_IMMICH_URL.
    if settings.immich_public_url.strip():
        external_url = public_album_url(album_id)
    else:
        external_url = external_url_override or public_album_url(album_id)

    return {
        "id": str(data.get("id") or album_id),
        "name": data.get("albumName") or "Álbum Immich",
        "asset_count": len(assets),
        "external_url": external_url,
        "assets": assets,
    }


async def fetch_asset_thumbnail(asset_id: str, size: str = "thumbnail") -> tuple[bytes, str]:
    if not is_valid_id(asset_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de fotografia inválido")
    if size not in ("thumbnail", "preview"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tamanho inválido")
    base, headers = _require_enabled()
    headers = {**headers, "Accept": "image/*"}
    client = _get_client()
    try:
        response = await client.get(
            f"{base}/api/assets/{asset_id}/thumbnail",
            params={"size": size},
            headers=headers,
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível obter a imagem do Immich",
        )
    _raise_for_immich_status(response, "Fotografia não encontrada no Immich")
    media_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    # Reject HTML error pages or SVG (XSS risk on same origin).
    if not media_type.startswith("image/") or media_type == "image/svg+xml":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="O servidor Immich devolveu um ficheiro de imagem inválido",
        )
    return response.content, media_type
