import httpx
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/api/tiles", tags=["tiles"])

OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
TILE_USER_AGENT = "Percursos/0.1 (https://github.com/manuelmgn/percurso)"


@router.get("/{z}/{x}/{y}.png")
async def get_tile(
    z: int,
    x: int,
    y: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tile_path = settings.tile_cache_dir / str(z) / str(x) / f"{y}.png"

    if tile_path.exists():
        content = tile_path.read_bytes()
        return Response(content=content, media_type="image/png", headers={"Cache-Control": "public, max-age=2592000"})

    # Fetch from OSM
    tile_path.parent.mkdir(parents=True, exist_ok=True)
    async with httpx.AsyncClient() as client:
        response = await client.get(
            OSM_TILE_URL.format(z=z, x=x, y=y),
            headers={"User-Agent": TILE_USER_AGENT},
            timeout=10.0,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Tile not available")

        tile_path.write_bytes(response.content)
        return Response(content=response.content, media_type="image/png", headers={"Cache-Control": "public, max-age=2592000"})
