from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.dependencies import get_current_user, require_admin
from app.models.place import Place
from app.models.trip import Trip, TripCompanion, TripPlace
from app.models.user import User
from app.schemas.place import VisitedPlaceResponse
from app.schemas.user import UserCreate, UserPublicResponse, UserResponse, UserUpdate, PasswordChangeRequest
from app.services.user_service import (
    create_user,
    deactivate_user,
    get_user_by_email,
    get_user_by_username,
    list_users,
    reactivate_user,
    update_user,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/places", response_model=list[VisitedPlaceResponse])
async def get_my_visited_places(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Return distinct visited places with per-place visit stats."""
    # Step 1: fetch (place_id, trip_id, trip_title, trip_start_date) without any geometry columns.
    # Using a plain join on integer columns avoids the DISTINCT-on-geometry problem that
    # caused silent 500 errors in the previous select(Place).distinct() approach.
    rows = (
        await db.execute(
            select(
                TripPlace.place_id,
                Trip.id.label("trip_id"),
                Trip.title.label("trip_title"),
                Trip.start_date.label("trip_start"),
            )
            .join(Trip, Trip.id == TripPlace.trip_id)
            .outerjoin(
                TripCompanion,
                and_(
                    TripCompanion.trip_id == Trip.id,
                    TripCompanion.user_id == current_user.id,
                    TripCompanion.status == "accepted",
                ),
            )
            .where(
                or_(
                    Trip.creator_id == current_user.id,
                    TripCompanion.id.isnot(None),
                )
            )
        )
    ).all()

    if not rows:
        return []

    # Group by place_id, deduplicating trips per place
    place_trips: dict[int, list[dict]] = defaultdict(list)
    for row in rows:
        seen_ids = {t["id"] for t in place_trips[row.place_id]}
        if row.trip_id not in seen_ids:
            place_trips[row.place_id].append({
                "id": row.trip_id,
                "title": row.trip_title,
                "start_date": row.trip_start,
            })

    # Step 2: load Place objects by ID — no geometry in GROUP BY or DISTINCT
    place_result = await db.execute(
        select(Place)
        .where(Place.id.in_(list(place_trips.keys())))
        .order_by(Place.name)
    )
    places = place_result.scalars().all()

    from app.api.v1.endpoints.places import _place_to_response

    output = []
    for place in places:
        base = _place_to_response(place)
        trips = place_trips[place.id]
        dates = [t["start_date"] for t in trips if t["start_date"] is not None]
        output.append({
            **base,
            "visit_count": len(trips),
            "first_visited": min(dates) if dates else None,
            "trips": [{"id": t["id"], "title": t["title"]} for t in trips],
        })
    return output


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    return await update_user(db, current_user, data)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(
    data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    from app.core.security import verify_password
    from app.services.user_service import change_password as _change_password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Palavra-passe atual incorreta")
    await _change_password(db, current_user, data.new_password)


@router.get("/{username}", response_model=UserPublicResponse)
async def get_user_profile(
    username: str,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")
    return user


# Admin-only endpoints
@router.get("", response_model=list[UserResponse])
async def list_all_users(
    skip: int = 0,
    limit: int = 50,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    return await list_users(db, skip=skip, limit=limit)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_new_user(
    data: UserCreate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    if await get_user_by_username(db, data.username):
        raise HTTPException(status_code=400, detail="Nome de utilizador já existe")
    if await get_user_by_email(db, data.email):
        raise HTTPException(status_code=400, detail="Email já registado")
    return await create_user(db, data)


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Não pode desativar a sua própria conta")
    from app.services.user_service import get_user_by_id
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return await deactivate_user(db, user)


@router.post("/{user_id}/reactivate", response_model=UserResponse)
async def reactivate(
    user_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    from app.services.user_service import get_user_by_id
    user = await get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return await reactivate_user(db, user)
