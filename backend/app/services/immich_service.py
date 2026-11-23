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


def extract_album_id_from_links(external_links: Optional[list[dict]]) -> Optional[str]:
    """Fallback: if a trip has no explicit immich_album_id, inspect its Immich
    external links for an `/albums/<id>` URL so pasted links work too."""
    if not external_links:
        return None
    for link in external_links:
        if not isinstance(link, dict) or link.get("type") != "immich":
            continue
        url = link.get("url") or ""
        try:
            path = urlparse(url).path
        except ValueError:
            continue
        match = _ALBUM_PATH_RE.search(path)
        if match:
            return match.group(1)
    return None


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


async def list_albums() -> list[dict]:
    base, headers = _require_enabled()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{base}/api/albums", headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contactar o servidor Immich",
        )
    _raise_for_immich_status(response, "Álbum não encontrado no Immich")
    raw_albums = response.json()
    albums = []
    for item in raw_albums:
        album_id = item.get("id")
        if not album_id or not is_valid_id(str(album_id)):
            continue
        thumb_id = item.get("albumThumbnailAssetId")
        thumbnail_url = (
            f"/api/immich/assets/{thumb_id}/thumbnail?size=thumbnail"
            if thumb_id and is_valid_id(str(thumb_id))
            else None
        )
        albums.append(
            {
                "id": str(album_id),
                "name": item.get("albumName") or "Sem título",
                "asset_count": int(item.get("assetCount") or 0),
                "start_date": item.get("startDate"),
                "end_date": item.get("endDate"),
                "thumbnail_url": thumbnail_url,
            }
        )
    albums.sort(key=lambda a: (a.get("start_date") or "", a["name"]), reverse=True)
    return albums


async def get_album(album_id: str) -> dict:
    if not is_valid_id(album_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de álbum Immich inválido")
    base, headers = _require_enabled()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{base}/api/albums/{album_id}", headers=headers)
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Não foi possível contactar o servidor Immich",
        )
    _raise_for_immich_status(response, "Álbum não encontrado no Immich")
    data = response.json()

    assets = []
    for item in data.get("assets") or []:
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

    return {
        "id": str(data.get("id") or album_id),
        "name": data.get("albumName") or "Álbum Immich",
        "asset_count": len(assets),
        "external_url": public_album_url(album_id),
        "assets": assets,
    }


async def fetch_asset_thumbnail(asset_id: str, size: str = "thumbnail") -> tuple[bytes, str]:
    if not is_valid_id(asset_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de fotografia inválido")
    if size not in ("thumbnail", "preview"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tamanho inválido")
    base, headers = _require_enabled()
    headers = {**headers, "Accept": "image/*"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
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
    media_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
    return response.content, media_type
