from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import User
from app.routers.guards import get_visible_trip_or_404
from app.services import immich_service

router = APIRouter(prefix="/api/immich", tags=["immich"])


class ImmichStatusResponse(BaseModel):
    enabled: bool
    public_url: Optional[str] = None


class ImmichAlbumSummary(BaseModel):
    id: str
    name: str
    asset_count: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    thumbnail_url: Optional[str] = None


class ImmichAsset(BaseModel):
    id: str
    thumbnail_url: str
    preview_url: str
    caption: Optional[str] = None
    taken_at: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    filename: Optional[str] = None


class ImmichAlbumDetail(BaseModel):
    id: str
    name: str
    asset_count: int
    external_url: Optional[str] = None
    assets: list[ImmichAsset]


@router.get("/status", response_model=ImmichStatusResponse)
def get_immich_status(_user: User = Depends(get_current_user)):
    return ImmichStatusResponse(
        enabled=settings.immich_enabled,
        public_url=immich_service.public_base_url() if settings.immich_enabled else None,
    )


@router.get("/albums", response_model=list[ImmichAlbumSummary])
async def list_immich_albums(_user: User = Depends(get_current_user)):
    return await immich_service.list_albums()


@router.get("/trips/{trip_id}/album", response_model=ImmichAlbumDetail)
async def get_trip_immich_album(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = get_visible_trip_or_404(db, trip_id, user)
    fallback_id, fallback_url = immich_service.extract_album_from_links(trip.external_links)
    album_id = trip.immich_album_id or fallback_id
    if not album_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum álbum Immich associado a esta viagem")
    return await immich_service.get_album(
        album_id,
        external_url_override=None if trip.immich_album_id else fallback_url,
    )


@router.get("/assets/{asset_id}/thumbnail")
async def get_immich_asset_thumbnail(
    asset_id: str,
    size: Literal["thumbnail", "preview"] = Query("thumbnail"),
    _user: User = Depends(get_current_user),
):
    content, media_type = await immich_service.fetch_asset_thumbnail(asset_id, size=size)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )
