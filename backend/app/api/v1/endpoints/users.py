from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, UploadFile, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.dependencies import get_current_user, get_optional_current_user, require_admin
from app.core.limiter import limiter

settings = get_settings()
from app.models.place import Place
from app.models.project import Project, ProjectTargetPlace
from app.models.trip import Trip, TripCompanion, TripPlace
from app.models.user import User
from app.schemas.place import VisitedPlaceResponse
from app.schemas.user import UserCreate, UserProfileResponse, UserPublicResponse, UserResponse, UserUpdate, PasswordChangeRequest, VisitedPlacePublic
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
    from sqlalchemy import func

    # Single aggregation query grouped by Place.id.
    # PostgreSQL allows selecting all columns of the grouped table when the PK is in GROUP BY
    # (functional dependency), so we avoid geometry columns in GROUP BY entirely.
    agg_rows = (await db.execute(
        select(
            Place.id,
            Place.osm_id,
            Place.osm_type,
            Place.name,
            Place.name_pt,
            Place.place_type,
            Place.country_code,
            Place.region_name,
            Place.centroid_lat,
            Place.centroid_lng,
            Place.centroid,
            Place.geometry_geojson,
            Place.wikipedia_summary,
            Place.wikipedia_language,
            Place.wikipedia_title,
            func.count(func.distinct(TripPlace.trip_id)).label("visit_count"),
            func.min(Trip.start_date).label("first_visited"),
        )
        .join(TripPlace, TripPlace.place_id == Place.id)
        .join(Trip, Trip.id == TripPlace.trip_id)
        .outerjoin(
            TripCompanion,
            and_(
                TripCompanion.trip_id == Trip.id,
                TripCompanion.user_id == current_user.id,
                TripCompanion.status == "accepted",
            ),
        )
        .where(or_(
            Trip.creator_id == current_user.id,
            TripCompanion.id.isnot(None),
        ))
        .group_by(Place.id)
        .order_by(Place.name)
    )).all()

    if not agg_rows:
        return []

    place_ids = [r.id for r in agg_rows]

    # Second query: trip links per place (cannot aggregate these in the same query
    # without losing individual trip titles)
    trip_rows = (await db.execute(
        select(TripPlace.place_id, Trip.id.label("trip_id"), Trip.title.label("trip_title"))
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
            TripPlace.place_id.in_(place_ids),
            or_(
                Trip.creator_id == current_user.id,
                TripCompanion.id.isnot(None),
            ),
        )
        .distinct()
    )).all()

    place_trips: dict[int, list[dict]] = defaultdict(list)
    seen_keys: set[tuple[int, int]] = set()
    for tr in trip_rows:
        key = (tr.place_id, tr.trip_id)
        if key not in seen_keys:
            seen_keys.add(key)
            place_trips[tr.place_id].append({"id": tr.trip_id, "title": tr.trip_title})

    def _coords(r) -> tuple[float | None, float | None]:
        """Return (lng, lat) preferring float columns, falling back to PostGIS centroid."""
        lng, lat = r.centroid_lng, r.centroid_lat
        if (lng is None or lat is None) and r.centroid is not None:
            try:
                from geoalchemy2.shape import to_shape
                pt = to_shape(r.centroid)
                lng, lat = pt.x, pt.y
            except Exception:
                pass
        return lng, lat

    results = []
    for r in agg_rows:
        lng, lat = _coords(r)
        results.append({
            "id": r.id,
            "osm_id": r.osm_id,
            "osm_type": r.osm_type,
            "name": r.name,
            "name_pt": r.name_pt,
            "place_type": r.place_type,
            "country_code": r.country_code,
            "region_name": r.region_name,
            "wikipedia_summary": r.wikipedia_summary,
            "wikipedia_language": r.wikipedia_language,
            "wikipedia_title": r.wikipedia_title,
            "centroid_lng": lng,
            "centroid_lat": lat,
            "has_polygon": r.geometry_geojson is not None,
            "geometry_geojson": r.geometry_geojson,
            "visit_count": r.visit_count,
            "first_visited": r.first_visited,
            "trips": place_trips[r.id],
        })
    return results


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    updated = await update_user(db, current_user, data)
    if updated.visited_places_visibility == "link" and not updated.visited_places_sharing_token:
        from app.core.security import generate_sharing_token
        updated.visited_places_sharing_token = generate_sharing_token()
        await db.flush()
    return updated


@router.post("/me/avatar", response_model=UserResponse)
@limiter.limit("10/minute")
async def upload_my_avatar(
    request: Request,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    from app.services.storage_service import _detect_mime_type, delete_from_imgbb, upload_to_imgbb
    image_bytes = await file.read()
    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A imagem não pode ter mais de 5 MB")
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    detected = _detect_mime_type(image_bytes)
    if detected not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Formato de imagem não suportado (jpeg, png, webp ou gif)")
    url, delete_url = await upload_to_imgbb(image_bytes, name=f"avatar-{current_user.id}")
    old_delete_url = current_user.avatar_delete_url
    current_user.avatar_url = url
    current_user.avatar_delete_url = delete_url
    await db.flush()
    if old_delete_url:
        background_tasks.add_task(delete_from_imgbb, old_delete_url)
    return current_user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def change_my_password(
    request: Request,
    data: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    from app.core.security import verify_password
    from app.services.user_service import change_password as _change_password
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Palavra-passe atual incorreta")
    await _change_password(db, current_user, data.new_password)


async def _load_visited_places_public(db: AsyncSession, user_id: int) -> list[dict]:
    """Load a user's distinct visited places without dates or trip details.
    Only includes places from non-private trips so that private trip
    destinations are not exposed through the public visited-places feature."""
    rows = (
        await db.execute(
            select(TripPlace.place_id)
            .join(Trip, Trip.id == TripPlace.trip_id)
            .where(
                Trip.creator_id == user_id,
                Trip.visibility != "private",
            )
            .distinct()
        )
    ).all()
    if not rows:
        return []
    place_ids = [r.place_id for r in rows]
    place_result = await db.execute(
        select(Place).where(Place.id.in_(place_ids)).order_by(Place.name)
    )
    places = place_result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "name_pt": p.name_pt,
            "place_type": p.place_type,
            "country_code": p.country_code,
            "region_name": p.region_name,
        }
        for p in places
    ]


@router.get("/{username}/places", response_model=list[VisitedPlacePublic])
async def get_user_visited_places(
    username: str,
    token: str | None = None,
    x_share_token: str | None = Header(default=None, alias="X-Share-Token"),
    requesting_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado")

    is_owner = requesting_user is not None and requesting_user.id == user.id
    vis = user.visited_places_visibility
    # Prefer header; fall back to query param for backward compatibility.
    # Sending via header avoids token leakage in server logs / Referer.
    effective_token = x_share_token or token

    if not is_owner:
        if vis == "public":
            pass  # allowed
        elif vis == "link" and effective_token == user.visited_places_sharing_token:
            pass  # allowed
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado")

    return await _load_visited_places_public(db, user.id)


@router.get("/{username}", response_model=UserProfileResponse)
async def get_user_profile(
    username: str,
    _current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")

    from sqlalchemy import func

    # Public trips
    trips_result = await db.execute(
        select(Trip)
        .where(Trip.creator_id == user.id, Trip.visibility == "public")
        .order_by(Trip.start_date.desc().nullslast())
    )
    trips_rows = trips_result.scalars().all()

    # Place counts for each trip
    trip_place_counts: dict[int, int] = {}
    if trips_rows:
        counts_result = await db.execute(
            select(TripPlace.trip_id, func.count(TripPlace.place_id).label("cnt"))
            .where(TripPlace.trip_id.in_([t.id for t in trips_rows]))
            .group_by(TripPlace.trip_id)
        )
        trip_place_counts = {row.trip_id: row.cnt for row in counts_result.all()}

    trips_summary = [
        {
            "id": t.id,
            "title": t.title,
            "start_date": t.start_date,
            "end_date": t.end_date,
            "cover_image_url": t.cover_image_url,
            "cover_colour": t.cover_colour,
            "place_count": trip_place_counts.get(t.id, 0),
        }
        for t in trips_rows
    ]

    # Public projects
    projects_result = await db.execute(
        select(Project)
        .where(Project.creator_id == user.id, Project.visibility == "public")
        .order_by(Project.id.desc())
    )
    projects_rows = projects_result.scalars().all()

    projects_summary = []
    for p in projects_rows:
        target_count_result = await db.execute(
            select(func.count(ProjectTargetPlace.place_id)).where(ProjectTargetPlace.project_id == p.id)
        )
        target_count = target_count_result.scalar() or 0

        visited_count_result = await db.execute(
            select(func.count()).select_from(
                select(TripPlace.place_id).distinct()
                .join(Trip, Trip.id == TripPlace.trip_id)
                .join(ProjectTargetPlace, ProjectTargetPlace.place_id == TripPlace.place_id)
                .where(
                    ProjectTargetPlace.project_id == p.id,
                    Trip.creator_id == user.id,
                )
                .subquery()
            )
        )
        visited_count = visited_count_result.scalar() or 0

        projects_summary.append({
            "id": p.id,
            "title": p.title,
            "cover_image_url": p.cover_image_url,
            "cover_colour": p.cover_colour,
            "target_place_count": target_count,
            "visited_place_count": visited_count,
        })

    # Visited places (if public)
    visited_places: list[dict] = []
    visited_place_count: int | None = None
    if user.visited_places_visibility == "public":
        visited_places = await _load_visited_places_public(db, user.id)
        visited_place_count = len(visited_places)

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "biography": user.biography,
        "website_url": user.website_url,
        "trips": trips_summary,
        "projects": projects_summary,
        "visited_place_count": visited_place_count,
        "visited_places": visited_places,
    }


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
