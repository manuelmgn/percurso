"""Proxy client for an optional self-hosted Immich instance.

Each user configures their own Immich API key in Settings (encrypted at rest
with Fernet derived from settings.secret_key). All API calls and image fetches
go through the backend so API keys never leave the server and Percurso's
session + trip visibility rules apply uniformly.
"""

import base64
import hashlib
import re
import time
from typing import Optional
from urllib.parse import urlparse

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status

from app.config import settings
from app.models import Trip, User

_ID_RE = re.compile(r"^[a-zA-Z0-9-]{1,64}$")
_ALBUM_PATH_RE = re.compile(r"/albums/([a-zA-Z0-9-]{1,64})(?:/|$)")
_ENC_PREFIX = "enc:v1:"

# Short-lived allowlist of asset IDs per (owner_id, album_id) so trip-scoped
# thumbnail requests can verify an asset actually belongs to the linked album
# without hitting Immich's album endpoint on every single image tile.
_ALBUM_CACHE_TTL_SECONDS = 300.0
_ALBUM_CACHE_MAX_ENTRIES = 256
_album_assets_cache: dict[tuple[int, str], tuple[float, set[str]]] = {}

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


def _fernet() -> Fernet:
    digest = hashlib.sha256(
        f"percursos:immich-api-key:v1:{settings.secret_key}".encode("utf-8")
    ).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_api_key(raw_key: str) -> str:
    cleaned = raw_key.strip()
    if not cleaned:
        raise ValueError("Chave API do Immich vazia")
    token = _fernet().encrypt(cleaned.encode("utf-8")).decode("ascii")
    return f"{_ENC_PREFIX}{token}"


def decrypt_api_key(stored: Optional[str]) -> Optional[str]:
    if not stored:
        return None
    if stored.startswith(_ENC_PREFIX):
        token = stored[len(_ENC_PREFIX):].encode("ascii")
        try:
            return _fernet().decrypt(token).decode("utf-8").strip() or None
        except (InvalidToken, ValueError):
            return None
    # Defensive fallback if an unprefixed value was ever written directly.
    return stored.strip() or None


def user_has_api_key(user: Optional[User]) -> bool:
    return bool(user and decrypt_api_key(user.immich_api_key))


def is_valid_id(value: str) -> bool:
    return bool(_ID_RE.match(value))


def _cache_album_assets(owner_id: int, album_id: str, asset_ids: set[str]) -> None:
    now = time.monotonic()
    if len(_album_assets_cache) >= _ALBUM_CACHE_MAX_ENTRIES:
        expired = [k for k, (exp, _) in _album_assets_cache.items() if exp <= now]
        for k in expired:
            _album_assets_cache.pop(k, None)
        if len(_album_assets_cache) >= _ALBUM_CACHE_MAX_ENTRIES:
            _album_assets_cache.clear()
    _album_assets_cache[(owner_id, album_id)] = (now + _ALBUM_CACHE_TTL_SECONDS, set(asset_ids))


def invalidate_owner_cache(owner_id: int) -> None:
    for key in [k for k in _album_assets_cache if k[0] == owner_id]:
        _album_assets_cache.pop(key, None)


def clear_album_cache() -> None:
    _album_assets_cache.clear()


def _require_server() -> str:
    if not settings.immich_server_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integração com o Immich não configurada neste servidor",
        )
    return settings.immich_url.strip().rstrip("/")


def _require_auth(
    api_key: Optional[str],
    *,
    missing_detail: str = "Configura a tua chave API do Immich nos Ajustes",
) -> tuple[str, dict[str, str]]:
    base = _require_server()
    cleaned = (api_key or "").strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=missing_detail,
        )
    headers = {
        "x-api-key": cleaned,
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


def resolve_trip_immich_context(
    trip: Trip, viewer: User
) -> tuple[Optional[str], Optional[int], Optional[str], Optional[str]]:
    """Return (album_id, owner_id, api_key, external_url_override) for a trip.

    Explicitly linked albums use the API key of the user who linked them
    (immich_owner, falling back to creator on legacy rows). Pasted external
    links without an explicit link only ever use the viewer's own key so a
    participant cannot paste an album UUID to probe another user's library.
    """
    if trip.immich_album_id:
        owner = trip.immich_owner or trip.creator
        owner_key = decrypt_api_key(owner.immich_api_key) if owner else None
        return trip.immich_album_id, (owner.id if owner else None), owner_key, None
    fallback_id, fallback_url = extract_album_from_links(trip.external_links)
    if fallback_id:
        viewer_key = decrypt_api_key(viewer.immich_api_key)
        return fallback_id, viewer.id, viewer_key, fallback_url
    return None, None, None, None


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


async def validate_api_key(api_key: str) -> None:
    """Verify a user-supplied Immich API key against GET /api/users/me before
    storing it."""
    base = _require_server()
    cleaned = api_key.strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A chave API do Immich não pode estar vazia",
        )
    client = _get_client()
    try:
        response = await client.get(
            f"{base}/api/users/me",
            headers={"x-api-key": cleaned, "Accept": "application/json"},
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contactar o servidor Immich",
        )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chave API do Immich inválida ou sem permissões",
        )
    if response.status_code >= 400:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="O servidor Immich devolveu um erro inesperado",
        )


async def list_albums(api_key: Optional[str]) -> list[dict]:
    base, headers = _require_auth(api_key)
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

    # Also include albums shared with this API key's Immich user (best-effort
    # so older Immich versions or restricted keys still return owned albums).
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
        thumb_asset_id = str(thumb_id) if thumb_id and is_valid_id(str(thumb_id)) else None
        thumbnail_url = (
            f"/api/immich/assets/{thumb_asset_id}/thumbnail?size=thumbnail"
            if thumb_asset_id
            else None
        )
        albums.append(
            {
                "id": album_id_str,
                "name": item.get("albumName") or "Sem título",
                "asset_count": int(item.get("assetCount") or 0),
                "start_date": item.get("startDate"),
                "end_date": item.get("endDate"),
                "thumbnail_asset_id": thumb_asset_id,
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


async def get_album(
    api_key: Optional[str],
    album_id: str,
    *,
    trip_id: Optional[int] = None,
    owner_id: Optional[int] = None,
    external_url_override: Optional[str] = None,
    missing_detail: str = "Configura a tua chave API do Immich nos Ajustes",
) -> dict:
    if not is_valid_id(album_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de álbum Immich inválido")
    base, headers = _require_auth(api_key, missing_detail=missing_detail)
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

    asset_prefix = f"/api/immich/trips/{trip_id}/assets" if trip_id is not None else "/api/immich/assets"
    assets = []
    allowed_ids: set[str] = set()
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
        asset_id_str = str(asset_id)
        allowed_ids.add(asset_id_str)
        exif = item.get("exifInfo") or {}
        caption = (exif.get("description") or "").strip() or None
        assets.append(
            {
                "id": asset_id_str,
                "thumbnail_url": f"{asset_prefix}/{asset_id_str}/thumbnail?size=thumbnail",
                "preview_url": f"{asset_prefix}/{asset_id_str}/thumbnail?size=preview",
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

    thumb_id = data.get("albumThumbnailAssetId")
    thumb_asset_id = str(thumb_id) if thumb_id and is_valid_id(str(thumb_id)) else None
    if thumb_asset_id:
        allowed_ids.add(thumb_asset_id)

    if owner_id is not None:
        _cache_album_assets(owner_id, album_id, allowed_ids)

    return {
        "id": str(data.get("id") or album_id),
        "name": data.get("albumName") or "Álbum Immich",
        "asset_count": len(assets),
        "thumbnail_asset_id": thumb_asset_id,
        "external_url": external_url,
        "assets": assets,
    }


async def verify_album_and_get_thumbnail(api_key: Optional[str], album_id: str) -> Optional[str]:
    """Verify the given user's API key can access `album_id` and return its
    `albumThumbnailAssetId` (or None if the album has no cover set).

    Called when linking an Immich album to a trip so users can only link
    albums accessible to their own Immich account."""
    if not is_valid_id(album_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de álbum Immich inválido")
    base, headers = _require_auth(api_key)
    client = _get_client()
    try:
        response = await client.get(f"{base}/api/albums/{album_id}", headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contactar o servidor Immich",
        )
    # Immich returns 400 or 404 when an album doesn't exist or belongs to another user.
    if response.status_code == 400:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Álbum não encontrado no Immich")
    _raise_for_immich_status(response, "Álbum não encontrado no Immich")
    data = _parse_json(response)
    if not isinstance(data, dict):
        return None
    thumb_id = data.get("albumThumbnailAssetId")
    if thumb_id and is_valid_id(str(thumb_id)):
        return str(thumb_id)
    return None


async def get_album_asset_ids(
    owner_id: int,
    api_key: Optional[str],
    album_id: str,
    *,
    missing_detail: str = "Configura a tua chave API do Immich nos Ajustes",
) -> set[str]:
    """Return the set of image/thumbnail asset IDs belonging to `album_id`,
    served from a short TTL cache when warm."""
    now = time.monotonic()
    cached = _album_assets_cache.get((owner_id, album_id))
    if cached and cached[0] > now:
        return cached[1]
    album = await get_album(
        api_key,
        album_id,
        owner_id=owner_id,
        missing_detail=missing_detail,
    )
    ids = {a["id"] for a in album["assets"]}
    if album.get("thumbnail_asset_id"):
        ids.add(album["thumbnail_asset_id"])
    return ids


async def fetch_asset_thumbnail(
    api_key: Optional[str],
    asset_id: str,
    size: str = "thumbnail",
    *,
    missing_detail: str = "Configura a tua chave API do Immich nos Ajustes",
) -> tuple[bytes, str]:
    if not is_valid_id(asset_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de fotografia inválido")
    if size not in ("thumbnail", "preview"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tamanho inválido")
    base, headers = _require_auth(api_key, missing_detail=missing_detail)
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
