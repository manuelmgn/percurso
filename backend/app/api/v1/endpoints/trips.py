import logging
import random
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
from app.core.limiter import limiter
from app.core.security import generate_sharing_token, generate_invite_token
from app.models.activity import ActivityEvent
from app.models.place import Place
from app.models.trip import Trip, TripCompanion, TripMediaLink, TripPlace, TripProject, TripSharedUser
from app.models.user import User
from app.models.project import Project, ProjectCollaborator
from app.schemas.trip import MediaLinkCreate, SharedUserRequest, TripCreate, TripDetailResponse, TripResponse, TripUpdate
from app.services.og_service import fetch_og_metadata
from app.services.storage_service import delete_from_imgbb, upload_cover_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trips", tags=["trips"])


def _place_to_summary(place) -> dict:
    """Serialise a Place ORM object into a PlaceSummaryResponse-compatible dict."""
    lng = place.centroid_lng
    lat = place.centroid_lat
    if lng is None and place.centroid is not None:
        try:
            from geoalchemy2.shape import to_shape
            pt = to_shape(place.centroid)
            lng, lat = pt.x, pt.y
        except Exception:
            pass
    return {
        "id": place.id,
        "osm_id": place.osm_id,
        "name": place.name,
        "name_pt": place.name_pt,
        "place_type": place.place_type,
        "country_code": place.country_code,
        "region_name": place.region_name,
        "centroid_lng": lng,
        "centroid_lat": lat,
        "geometry_geojson": place.geometry_geojson,
    }

_COVER_COLOURS = [
    "#7C3AED", "#6D28D9", "#4F46E5", "#0369A1", "#0891B2",
    "#0D9488", "#059669", "#65A30D", "#B45309", "#C2410C",
    "#BE185D", "#7E22CE",
]


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


def _trip_to_response(trip: Trip, include_pending: bool = False) -> dict:
    if include_pending:
        companions_list = [c for c in trip.companions if c.status != "declined"]
    else:
        companions_list = [c for c in trip.companions if c.status == "accepted"]
    return {
        "id": trip.id,
        "title": trip.title,
        "description": trip.description,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "cover_image_url": trip.cover_image_url,
        "cover_image_generating": trip.cover_image_generating,
        "cover_colour": trip.cover_colour,
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
            for c in companions_list
        ],
        "place_count": len(trip.places),
        "associated_projects": [
            {
                "id": tp.project_id,
                "title": tp.project.title,
                "cover_colour": tp.project.cover_colour,
                "cover_image_url": tp.project.cover_image_url,
            }
            for tp in trip.project_associations
        ],
    }


async def _load_trip(db: AsyncSession, trip_id: int) -> Trip | None:
    result = await db.execute(
        select(Trip)
        .options(
            selectinload(Trip.creator),
            selectinload(Trip.companions).selectinload(TripCompanion.user),
            selectinload(Trip.places).selectinload(TripPlace.place),
            selectinload(Trip.media_links),
            selectinload(Trip.shared_with).selectinload(TripSharedUser.user),
            selectinload(Trip.project_associations).selectinload(TripProject.project),
        )
        .where(Trip.id == trip_id)
    )
    return result.scalar_one_or_none()


async def _load_trip_by_token(db: AsyncSession, token: str) -> Trip | None:
    result = await db.execute(
        select(Trip)
        .options(
            selectinload(Trip.creator),
            selectinload(Trip.companions).selectinload(TripCompanion.user),
            selectinload(Trip.places).selectinload(TripPlace.place),
            selectinload(Trip.media_links),
            selectinload(Trip.shared_with),
            selectinload(Trip.project_associations).selectinload(TripProject.project),
        )
        .where(Trip.sharing_token == token, Trip.visibility == "link")
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
        cover_colour=random.choice(_COVER_COLOURS),
    )
    if trip.visibility in ("link", "users"):
        trip.sharing_token = generate_sharing_token()
    db.add(trip)
    await db.flush()
    trip = await _load_trip(db, trip.id)
    return _trip_to_response(trip)


@router.get("", response_model=list[TripResponse])
async def list_my_trips(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(Trip)
        .options(
            selectinload(Trip.creator),
            selectinload(Trip.companions).selectinload(TripCompanion.user),
            selectinload(Trip.places),
            selectinload(Trip.project_associations).selectinload(TripProject.project),
        )
        .where(
            or_(
                Trip.creator_id == current_user.id,
                Trip.id.in_(
                    select(TripCompanion.trip_id).where(
                        TripCompanion.user_id == current_user.id,
                        TripCompanion.status == "accepted",
                    )
                ),
            )
        )
        .order_by(Trip.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    trips = result.scalars().all()
    return [_trip_to_response(t) for t in trips]


@router.get("/shared/{token}", response_model=TripDetailResponse)
async def get_shared_trip(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    trip = await _load_trip_by_token(db, token)
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada ou link inválido")
    data = _trip_to_response(trip)
    data["companions"] = []
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
    data["places"] = [_place_to_summary(tp.place) for tp in trip.places]
    return data


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

    # Safety timeout: if generating flag is stuck for > 5 min, clear it.
    if trip.cover_image_generating:
        age = datetime.now(timezone.utc) - trip.updated_at.replace(tzinfo=timezone.utc)
        if age > timedelta(minutes=5):
            trip.cover_image_generating = False
            await db.flush()

    is_creator = trip.creator_id == current_user.id
    data = _trip_to_response(trip, include_pending=is_creator)
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
    data["places"] = [_place_to_summary(tp.place) for tp in trip.places]
    data["shared_with"] = (
        [
            {
                "id": s.id,
                "user_id": s.user_id,
                "username": s.user.username,
                "display_name": s.user.display_name,
                "avatar_url": s.user.avatar_url,
            }
            for s in trip.shared_with
        ]
        if is_creator else []
    )
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

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(trip, field, value)

    if trip.visibility in ("link", "users") and not trip.sharing_token:
        trip.sharing_token = generate_sharing_token()

    await db.flush()
    trip = await _load_trip(db, trip_id)
    return _trip_to_response(trip)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    trip_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    if trip.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    if trip.cover_image_delete_url:
        background_tasks.add_task(delete_from_imgbb, trip.cover_image_delete_url)
    await db.delete(trip)


@router.post("/{trip_id}/cover", response_model=TripResponse)
@limiter.limit("10/minute")
async def upload_trip_cover(
    request: Request,
    trip_id: int,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    content = await file.read()
    try:
        url, delete_url = await upload_cover_image(content, file.filename or "cover.jpg")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    old_delete_url = trip.cover_image_delete_url
    trip.cover_image_url = url
    trip.cover_image_delete_url = delete_url
    trip.cover_image_generating = False
    await db.flush()

    if old_delete_url:
        background_tasks.add_task(delete_from_imgbb, old_delete_url)

    trip = await _load_trip(db, trip_id)
    return _trip_to_response(trip)


@router.delete("/{trip_id}/cover", response_model=TripResponse)
async def delete_trip_cover(
    trip_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    old_delete_url = trip.cover_image_delete_url
    trip.cover_image_url = None
    trip.cover_image_delete_url = None
    trip.cover_image_generating = False
    await db.flush()

    if old_delete_url:
        background_tasks.add_task(delete_from_imgbb, old_delete_url)

    trip = await _load_trip(db, trip_id)
    return _trip_to_response(trip)


@router.post("/{trip_id}/generate-cover", response_model=TripResponse)
@limiter.limit("5/hour")
async def generate_trip_cover(
    request: Request,
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        trip = await db.get(Trip, trip_id)
        if not trip or trip.creator_id != current_user.id:
            raise HTTPException(status_code=404, detail="Viagem não encontrada")

        from app.workers.celery_app import celery_app

        trip.cover_image_generating = True
        await db.flush()

        try:
            celery_app.send_task(
                "generate_cover_image",
                args=[trip_id, "trip", trip.title, trip.description],
            )
        except Exception as exc:
            logger.error("Failed to dispatch cover generation task for trip %d: %s", trip_id, exc)
            trip.cover_image_generating = False
            await db.flush()

        trip = await _load_trip(db, trip_id)
        return _trip_to_response(trip)
    except HTTPException:
        raise
    except Exception:
        logger.error("generate_trip_cover error: %s", traceback.format_exc())
        raise


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
    place = await db.get(Place, place_id)
    place_name = (place.name_pt or place.name) if place else str(place_id)
    db.add(ActivityEvent(
        actor_id=current_user.id,
        event_type="place_added_to_trip",
        entity_type="trip",
        entity_id=trip_id,
        entity_name=trip.title,
        secondary_name=place_name,
    ))


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


@router.delete("/{trip_id}/companions/{companion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_companion(
    trip_id: int,
    companion_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    result = await db.execute(
        select(TripCompanion).where(TripCompanion.id == companion_id, TripCompanion.trip_id == trip_id)
    )
    companion = result.scalar_one_or_none()
    if not companion:
        raise HTTPException(status_code=404, detail="Acompanhante não encontrado")

    from app.models.notification import Notification
    if companion.status == "accepted":
        db.add(Notification(
            recipient_id=companion.user_id,
            notification_type="removed_from_trip",
            entity_type="trip",
            entity_id=trip_id,
            actor_id=current_user.id,
            message=f"Foste removido da viagem «{trip.title}»",
        ))
    await db.delete(companion)


@router.post("/{trip_id}/shared-users", status_code=status.HTTP_201_CREATED)
async def add_trip_shared_user(
    trip_id: int,
    data: SharedUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    from app.services.user_service import get_user_by_username
    target = await get_user_by_username(db, data.username)
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode adicionar-se a si próprio")

    existing = await db.execute(
        select(TripSharedUser).where(TripSharedUser.trip_id == trip_id, TripSharedUser.user_id == target.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Utilizador já tem acesso")

    db.add(TripSharedUser(trip_id=trip_id, user_id=target.id))
    return {"detail": "Acesso concedido"}


@router.delete("/{trip_id}/shared-users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_trip_shared_user(
    trip_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    result = await db.execute(
        select(TripSharedUser).where(TripSharedUser.trip_id == trip_id, TripSharedUser.user_id == user_id)
    )
    entry = result.scalar_one_or_none()
    if entry:
        await db.delete(entry)


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
    db.add(Notification(
        recipient_id=trip.creator_id,
        notification_type="invite_accepted",
        entity_type="trip",
        entity_id=trip_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} aceitou o convite para a viagem «{trip.title}»",
    ))
    db.add(ActivityEvent(
        actor_id=current_user.id,
        event_type="companion_joined",
        entity_type="trip",
        entity_id=trip_id,
        entity_name=trip.title,
    ))
    return {"detail": "Convite aceite"}


@router.post("/{trip_id}/companions/accept-me", status_code=status.HTTP_200_OK)
async def accept_trip_invite_as_me(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(TripCompanion).where(
            TripCompanion.trip_id == trip_id,
            TripCompanion.user_id == current_user.id,
            TripCompanion.status == "pending",
        )
    )
    companion = result.scalar_one_or_none()
    if not companion:
        raise HTTPException(status_code=404, detail="Convite pendente não encontrado")
    companion.status = "accepted"
    trip = await db.get(Trip, trip_id)
    from app.models.notification import Notification
    db.add(Notification(
        recipient_id=trip.creator_id,
        notification_type="invite_accepted",
        entity_type="trip",
        entity_id=trip_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} aceitou o convite para a viagem «{trip.title}»",
    ))
    db.add(ActivityEvent(
        actor_id=current_user.id,
        event_type="companion_joined",
        entity_type="trip",
        entity_id=trip_id,
        entity_name=trip.title,
    ))
    return {"detail": "Convite aceite"}


@router.post("/{trip_id}/companions/decline-me", status_code=status.HTTP_200_OK)
async def decline_trip_invite_as_me(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(TripCompanion).where(
            TripCompanion.trip_id == trip_id,
            TripCompanion.user_id == current_user.id,
            TripCompanion.status == "pending",
        )
    )
    companion = result.scalar_one_or_none()
    if not companion:
        raise HTTPException(status_code=404, detail="Convite pendente não encontrado")
    companion.status = "declined"
    trip = await db.get(Trip, trip_id)
    from app.models.notification import Notification
    db.add(Notification(
        recipient_id=trip.creator_id,
        notification_type="invite_declined",
        entity_type="trip",
        entity_id=trip_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} recusou o convite para a viagem «{trip.title}»",
    ))
    return {"detail": "Convite recusado"}


@router.post("/{trip_id}/companions/leave-me", status_code=status.HTTP_200_OK)
async def leave_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(TripCompanion).where(
            TripCompanion.trip_id == trip_id,
            TripCompanion.user_id == current_user.id,
            TripCompanion.status == "accepted",
        )
    )
    companion = result.scalar_one_or_none()
    if not companion:
        raise HTTPException(status_code=404, detail="Não és acompanhante aceite desta viagem")

    trip = await db.get(Trip, trip_id)
    from app.models.notification import Notification
    db.add(Notification(
        recipient_id=trip.creator_id,
        notification_type="companion_left",
        entity_type="trip",
        entity_id=trip_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} saiu da viagem «{trip.title}»",
    ))
    await db.delete(companion)
    return {"detail": "Saíste da viagem"}


@router.delete("/{trip_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_media_link(
    trip_id: int,
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    result = await db.execute(
        select(TripMediaLink).where(TripMediaLink.id == media_id, TripMediaLink.trip_id == trip_id)
    )
    link = result.scalar_one_or_none()
    if link:
        await db.delete(link)


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


# ── Trip-Project association endpoints ────────────────────────────────────────

@router.get("/{trip_id}/projects/member-check/{project_id}")
async def check_project_members(
    trip_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Return project members who are not companions on the trip."""
    trip = await _load_trip(db, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    project = await db.execute(
        select(Project)
        .options(
            selectinload(Project.collaborators).selectinload(ProjectCollaborator.user),
        )
        .where(Project.id == project_id, Project.creator_id == current_user.id)
    )
    project = project.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    trip_member_ids = {c.user_id for c in trip.companions if c.status == "accepted"}
    trip_member_ids.add(trip.creator_id)

    missing = []
    # Check project creator
    if project.creator_id != current_user.id and project.creator_id not in trip_member_ids:
        u = await db.get(User, project.creator_id)
        if u:
            missing.append({"user_id": u.id, "display_name": u.display_name, "username": u.username})

    for c in project.collaborators:
        if c.status == "accepted" and c.user_id not in trip_member_ids and c.user_id != current_user.id:
            missing.append({"user_id": c.user_id, "display_name": c.user.display_name, "username": c.user.username})

    return {"missing_members": missing}


@router.post("/{trip_id}/projects/{project_id}", response_model=TripDetailResponse)
async def associate_trip_with_project(
    trip_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Associate a trip with a project. Trip creator must also be project creator or collaborator."""
    trip = await _load_trip(db, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    project = await db.execute(
        select(Project)
        .options(selectinload(Project.collaborators))
        .where(Project.id == project_id)
    )
    project = project.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    # Check user is creator or accepted collaborator
    accepted_ids = {c.user_id for c in project.collaborators if c.status == "accepted"}
    if project.creator_id != current_user.id and current_user.id not in accepted_ids:
        raise HTTPException(status_code=403, detail="Não tens acesso a este projeto")

    # Idempotent: only insert if not already associated
    existing = await db.execute(
        select(TripProject).where(TripProject.trip_id == trip_id, TripProject.project_id == project_id)
    )
    if not existing.scalar_one_or_none():
        db.add(TripProject(trip_id=trip_id, project_id=project_id))
        await db.flush()

    trip = await _load_trip(db, trip_id)
    return _trip_to_response(trip, include_pending=True)


@router.delete("/{trip_id}/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disassociate_trip_from_project(
    trip_id: int,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    result = await db.execute(
        select(TripProject).where(TripProject.trip_id == trip_id, TripProject.project_id == project_id)
    )
    assoc = result.scalar_one_or_none()
    if assoc:
        await db.delete(assoc)


@router.post("/{trip_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    if trip.is_pinned:
        return
    pinned_count = await db.scalar(
        select(func.count(Trip.id)).where(
            Trip.creator_id == current_user.id,
            Trip.is_pinned.is_(True),
        )
    )
    if (pinned_count or 0) >= 2:
        raise HTTPException(
            status_code=400,
            detail="Já tens 2 viagens fixadas. Remove uma para fixar esta.",
        )
    trip.is_pinned = True
    await db.flush()


@router.delete("/{trip_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    trip.is_pinned = False
    await db.flush()
