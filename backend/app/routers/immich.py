from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user, validate_csrf
from app.config import settings
from app.database import get_db
from app.models import User
from app.routers.guards import get_visible_trip_or_404
from app.services import immich_service

router = APIRouter(prefix="/api/immich", tags=["immich"])


class ImmichStatusResponse(BaseModel):
    enabled: bool
    server_configured: bool
    has_api_key: bool
    public_url: Optional[str] = None


class ImmichKeyUpdate(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=512)


class ImmichAlbumSummary(BaseModel):
    id: str
    name: str
    asset_count: int
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    thumbnail_asset_id: Optional[str] = None
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
    thumbnail_asset_id: Optional[str] = None
    external_url: Optional[str] = None
    assets: list[ImmichAsset]


def _status_for_user(user: User) -> ImmichStatusResponse:
    server_ok = settings.immich_server_configured
    has_key = immich_service.user_has_api_key(user)
    return ImmichStatusResponse(
        enabled=server_ok and has_key,
        server_configured=server_ok,
        has_api_key=has_key,
        public_url=immich_service.public_base_url() if server_ok else None,
    )


@router.get("/status", response_model=ImmichStatusResponse)
def get_immich_status(user: User = Depends(get_current_user)):
    return _status_for_user(user)


@router.put("/key", response_model=ImmichStatusResponse)
async def set_immich_api_key(
    payload: ImmichKeyUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    raw_key = payload.api_key.strip()
    await immich_service.validate_api_key(raw_key)
    user.immich_api_key = immich_service.encrypt_api_key(raw_key)
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    immich_service.invalidate_owner_cache(user.id)
    return _status_for_user(user)


@router.delete("/key", response_model=ImmichStatusResponse)
def delete_immich_api_key(
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    user.immich_api_key = None
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    immich_service.invalidate_owner_cache(user.id)
    return _status_for_user(user)


@router.get("/albums", response_model=list[ImmichAlbumSummary])
async def list_immich_albums(user: User = Depends(get_current_user)):
    api_key = immich_service.decrypt_api_key(user.immich_api_key)
    return await immich_service.list_albums(api_key)


@router.get("/trips/{trip_id}/album", response_model=ImmichAlbumDetail)
async def get_trip_immich_album(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = get_visible_trip_or_404(db, trip_id, user)
    album_id, owner_id, api_key, external_url_override = immich_service.resolve_trip_immich_context(trip, user)
    if not album_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum álbum Immich associado a esta viagem")
    missing_detail = (
        "O proprietário do álbum não tem a chave API do Immich configurada"
        if trip.immich_album_id and owner_id != user.id
        else "Configura a tua chave API do Immich nos Ajustes"
    )
    return await immich_service.get_album(
        api_key,
        album_id,
        trip_id=trip.id,
        owner_id=owner_id,
        external_url_override=external_url_override,
        missing_detail=missing_detail,
    )


@router.get("/trips/{trip_id}/assets/{asset_id}/thumbnail")
async def get_trip_immich_asset_thumbnail(
    trip_id: int,
    asset_id: str,
    size: Literal["thumbnail", "preview"] = Query("thumbnail"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not immich_service.is_valid_id(asset_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ID de fotografia inválido")
    trip = get_visible_trip_or_404(db, trip_id, user)
    album_id, owner_id, api_key, _ = immich_service.resolve_trip_immich_context(trip, user)
    missing_detail = (
        "O proprietário do álbum não tem a chave API do Immich configurada"
        if trip.immich_album_id and owner_id != user.id
        else "Configura a tua chave API do Immich nos Ajustes"
    )

    # Strict allowlist: viewers of a shared trip may ONLY fetch the trip's
    # cover asset or assets that actually belong to the linked album — never
    # arbitrary asset UUIDs from the album owner's Immich library.
    is_cover = bool(trip.cover_immich_asset_id and asset_id == trip.cover_immich_asset_id)
    if is_cover:
        cover_owner = trip.immich_owner or trip.creator
        api_key = immich_service.decrypt_api_key(cover_owner.immich_api_key) if cover_owner else None
        missing_detail = (
            "O proprietário do álbum não tem a chave API do Immich configurada"
            if cover_owner and cover_owner.id != user.id
            else "Configura a tua chave API do Immich nos Ajustes"
        )
    else:
        if not album_id or owner_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")
        allowed_ids = await immich_service.get_album_asset_ids(
            owner_id,
            api_key,
            album_id,
            missing_detail=missing_detail,
        )
        if asset_id not in allowed_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")

    content, media_type = await immich_service.fetch_asset_thumbnail(
        api_key,
        asset_id,
        size=size,
        missing_detail=missing_detail,
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/assets/{asset_id}/thumbnail")
async def get_immich_asset_thumbnail(
    asset_id: str,
    size: Literal["thumbnail", "preview"] = Query("thumbnail"),
    user: User = Depends(get_current_user),
):
    # Personal thumbnail proxy (used by the user's own album picker): always
    # uses the caller's own Immich API key so users can never probe others' assets.
    api_key = immich_service.decrypt_api_key(user.immich_api_key)
    content, media_type = await immich_service.fetch_asset_thumbnail(api_key, asset_id, size=size)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )
