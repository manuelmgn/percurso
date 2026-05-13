from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
from app.core.security import generate_sharing_token, generate_invite_token
from app.models.trip import Trip, TripCompanion, TripMediaLink, TripPlace, TripSharedUser
from app.models.user import User
from app.schemas.trip import MediaLinkCreate, TripCreate, TripDetailResponse, TripResponse, TripUpdate
from app.services.og_service import fetch_og_metadata
from app.services.storage_service import upload_cover_image

router = APIRouter(prefix="/trips", tags=["trips"])


def _check_trip_access(trip: Trip, current_user: User) -> bool:
    if trip.visibility == "public":
        return True
    if trip.creator_id == current_user.id:
        return True
    accepted_ids = {c.user_id for c in trip.companions if c.status == "accepted"}
    if current_user.id in accepted_ids:
        return True
    if trip.visibility == "users":
        shared_ids = {s.user_id for s in trip.shared_with}
        return current_user.id in shared_ids
    return False


def _trip_to_response(trip: Trip) -> dict:
    accepted_companions = [c for c in trip.companions if c.status == "accepted"]
    return {
        "id": trip.id,
        "title": trip.title,
        "description": trip.description,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "cover_image_url": trip.cover_image_url,
        "cover_image_generating": trip.cover_image_generating,
        "visibility": trip.visibility,
        "sharing_token": trip.sharing_token if trip.visibility in ("link", "users") else None,
        "creator_id": trip.creator_id,
        "creator_username": trip.creator.username,
        "creator_display_name": trip.creator.display_name,
        "companions": [
            {
                "id": c.id,
                "user_id": c.user_id,
                "username": c.user.username,
                "display_name": c.user.display_name,
                "avatar_url": c.user.avatar_url,
                "status": c.status,
            }
            for c in accepted_companions
        ],
        "place_count": len(trip.places),
    }


async def _load_trip(db: AsyncSession, trip_id: int) -> Trip | None:
    result = await db.execute(
        select(Trip)
        .options(
            selectinload(Trip.creator),
            selectinload(Trip.companions).selectinload(TripCompanion.user),
            selectinload(Trip.places),
            selectinload(Trip.media_links),
            selectinload(Trip.shared_with),
        )
        .where(Trip.id == trip_id)
    )
    return result.scalar_one_or_none()


@router.post("", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def create_trip(
    data: TripCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = Trip(
        creator_id=current_user.id,
        title=data.title,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        visibility=data.visibility or current_user.default_trip_visibility,
        cover_image_generating=True,
    )
    if trip.visibility in ("link",):
        trip.sharing_token = generate_sharing_token()
    db.add(trip)
    await db.flush()

    # Trigger AI cover generation
    from app.workers.image_worker import generate_cover_image_task
    generate_cover_image_task.delay(trip.id, "trip", data.title, data.description)

    await db.refresh(trip)
    trip = await _load_trip(db, trip.id)
    return _trip_to_response(trip)


@router.get("", response_model=list[TripResponse])
async def list_my_trips(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(Trip)
        .options(
            selectinload(Trip.creator),
            selectinload(Trip.companions).selectinload(TripCompanion.user),
            selectinload(Trip.places),
        )
        .where(Trip.creator_id == current_user.id)
        .order_by(Trip.created_at.desc())
    )
    trips = result.scalars().all()
    return [_trip_to_response(t) for t in trips]


@router.get("/{trip_id}", response_model=TripDetailResponse)
async def get_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await _load_trip(db, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    if not _check_trip_access(trip, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado a esta viagem")
    data = _trip_to_response(trip)
    data["media_links"] = [
        {
            "id": m.id,
            "url": m.url,
            "og_title": m.og_title,
            "og_description": m.og_description,
            "og_image_url": m.og_image_url,
            "og_site_name": m.og_site_name,
        }
        for m in trip.media_links
    ]
    return data


@router.patch("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: int,
    data: TripUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await _load_trip(db, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    if trip.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Apenas o criador pode editar a viagem")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(trip, field, value)

    if trip.visibility == "link" and not trip.sharing_token:
        trip.sharing_token = generate_sharing_token()

    await db.flush()
    trip = await _load_trip(db, trip_id)
    return _trip_to_response(trip)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    if trip.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    await db.delete(trip)


@router.post("/{trip_id}/cover", response_model=TripResponse)
async def upload_trip_cover(
    trip_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    content = await file.read()
    url = await upload_cover_image(
        current_user.id, "trip", trip_id, content,
        file.filename or "cover.jpg",
        file.content_type or "image/jpeg",
    )
    trip.cover_image_url = url
    trip.cover_image_generating = False
    await db.flush()
    trip = await _load_trip(db, trip_id)
    return _trip_to_response(trip)


@router.post("/{trip_id}/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_place_to_trip(
    trip_id: int,
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    existing = await db.execute(
        select(TripPlace).where(TripPlace.trip_id == trip_id, TripPlace.place_id == place_id)
    )
    if existing.scalar_one_or_none():
        return
    db.add(TripPlace(trip_id=trip_id, place_id=place_id))


@router.delete("/{trip_id}/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_place_from_trip(
    trip_id: int,
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    result = await db.execute(
        select(TripPlace).where(TripPlace.trip_id == trip_id, TripPlace.place_id == place_id)
    )
    tp = result.scalar_one_or_none()
    if tp:
        await db.delete(tp)


@router.post("/{trip_id}/companions/{username}", status_code=status.HTTP_201_CREATED)
async def invite_companion(
    trip_id: int,
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    from app.services.user_service import get_user_by_username
    from app.models.notification import Notification

    invitee = await get_user_by_username(db, username)
    if not invitee:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if invitee.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode convidar a si próprio")

    existing = await db.execute(
        select(TripCompanion).where(
            TripCompanion.trip_id == trip_id, TripCompanion.user_id == invitee.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Utilizador já convidado")

    companion = TripCompanion(
        trip_id=trip_id,
        user_id=invitee.id,
        invite_token=generate_invite_token(),
        status="pending",
    )
    db.add(companion)

    notification = Notification(
        recipient_id=invitee.id,
        notification_type="trip_invite",
        entity_type="trip",
        entity_id=trip_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} convidou-o para a viagem «{trip.title}»",
    )
    db.add(notification)
    return {"detail": "Convite enviado"}


@router.post("/{trip_id}/companions/accept/{invite_token}", status_code=status.HTTP_200_OK)
async def accept_trip_invite(
    trip_id: int,
    invite_token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(TripCompanion).where(
            TripCompanion.invite_token == invite_token,
            TripCompanion.trip_id == trip_id,
            TripCompanion.user_id == current_user.id,
        )
    )
    companion = result.scalar_one_or_none()
    if not companion:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    companion.status = "accepted"

    trip = await db.get(Trip, trip_id)
    from app.models.notification import Notification
    notification = Notification(
        recipient_id=trip.creator_id,
        notification_type="invite_accepted",
        entity_type="trip",
        entity_id=trip_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} aceitou o convite para a viagem «{trip.title}»",
    )
    db.add(notification)
    return {"detail": "Convite aceite"}


@router.post("/{trip_id}/media", status_code=status.HTTP_201_CREATED)
async def add_media_link(
    trip_id: int,
    data: MediaLinkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await _load_trip(db, trip_id)
    if not trip or not _check_trip_access(trip, current_user):
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    if trip.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")

    og = await fetch_og_metadata(data.url)
    link = TripMediaLink(
        trip_id=trip_id,
        url=data.url,
        og_title=og.get("og_title"),
        og_description=og.get("og_description"),
        og_image_url=og.get("og_image_url"),
        og_site_name=og.get("og_site_name"),
    )
    db.add(link)
    return {"detail": "Link adicionado"}
