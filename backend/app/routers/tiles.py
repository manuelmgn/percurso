import os
import tempfile

import httpx

from fastapi import APIRouter, Depends, HTTPException, Response

from app.config import settings
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/tiles", tags=["tiles"])

TILE_SOURCES = {
    "light": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "dark": "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
}
TILE_USER_AGENT = "Percursos/0.1 (https://github.com/manuelmgn/percurso)"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _tile_url(style: str, z: int, x: int, y: int) -> str:
    """CARTO basemaps now require an API key appended as a query parameter
    (free tier, requested by e-mail). OpenStreetMap tiles need no key."""
    url = TILE_SOURCES[style].format(z=z, x=x, y=y)
    key = settings.carto_tiles_key
    if key and "cartocdn" in url:
        separator = "&" if "?" in url else "?"
        return f"{url}{separator}key={key}"
    return url


@router.get("/{style}/{z}/{x}/{y}.png")
async def get_tile(
    style: str,
    z: int,
    x: int,
    y: int,
    user: User = Depends(get_current_user),
):
    if TILE_SOURCES.get(style) is None:
        raise HTTPException(status_code=400, detail="Estilo de tiles inválido")

    if not (0 <= z <= 19):
        raise HTTPException(status_code=400, detail="Coordenadas de tile inválidas")
    max_coord = 2 ** z
    if not (0 <= x < max_coord) or not (0 <= y < max_coord):
        raise HTTPException(status_code=400, detail="Coordenadas de tile inválidas")

    tile_path = settings.tile_cache_dir / style / str(z) / str(x) / f"{y}.png"

    if tile_path.exists():
        content = tile_path.read_bytes()
        return Response(content=content, media_type="image/png", headers={"Cache-Control": "public, max-age=2592000"})

    # Fetch from upstream provider
    tile_path.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient() as client:
        response = await client.get(
            _tile_url(style, z, x, y),
            headers={"User-Agent": TILE_USER_AGENT},
            timeout=10.0,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Tile não disponível")

        content = response.content
        content_type = response.headers.get("content-type", "")
        if not content.startswith(_PNG_MAGIC) and "image/png" not in content_type:
            # A 200 that is not a PNG (error page, rate-limit notice…) must
            # never enter the cache — serve it as-is, uncached.
            return Response(
                content=content,
                media_type=content_type.split(";")[0] or "application/octet-stream",
                headers={"Cache-Control": "no-store"},
            )

        # Atomic cache write: temp file in the same directory + rename, so a
        # crash mid-write can never leave a truncated tile that would be
        # served from cache forever.
        fd, tmp_path = tempfile.mkstemp(dir=tile_path.parent, suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as tmp_file:
                tmp_file.write(content)
            os.replace(tmp_path, tile_path)
        except OSError:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        return Response(content=content, media_type="image/png", headers={"Cache-Control": "public, max-age=2592000"})
