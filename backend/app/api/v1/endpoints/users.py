from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.core.dependencies import get_current_user, get_optional_current_user, require_admin
from app.core.limiter import limiter
from app.models.place import Place
from app.models.project import Project, ProjectTargetPlace
from app.models.settings import SiteSettings
from app.models.trip import Trip, TripCompanion, TripPlace
from app.models.user import User
from app.schemas.place import VisitedPlaceResponse
from app.schemas.user import (
    PasswordChangeRequest,
    TripPublicSummary,
    ProjectPublicSummary,
    UserCreate,
    UserProfileResponse,
    UserResponse,
    UserUpdate,
    VisitedPlacePublic,
)
from app.services.user_service import (
    create_user,
    deactivate_user,
    get_user_by_email,
    get_user_by_username,
    list_users,
    reactivate_user,
    update_user,
)

settings = get_settings()
router = APIRouter(prefix="/users", tags=["users"])


async def _get_site_settings(db: AsyncSession) -> SiteSettings:
    row = await db.get(SiteSettings, 1)
    if row is None:
        row = SiteSettings(id=1, allow_public_profiles_without_auth=True)
        db.add(row)
        await db.flush()
    return row


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
    """Load a user's distinct visited places with coordinates for map rendering.
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

    def _coords(p) -> tuple[float | None, float | None]:
        lng, lat = p.centroid_lng, p.centroid_lat
        if (lng is None or lat is None) and p.centroid is not None:
            try:
                from geoalchemy2.shape import to_shape
                pt = to_shape(p.centroid)
                lng, lat = pt.x, pt.y
            except Exception:
                pass
        return lng, lat

    result = []
    for p in places:
        lng, lat = _coords(p)
        result.append({
            "id": p.id,
            "name": p.name,
            "name_pt": p.name_pt,
            "place_type": p.place_type,
            "country_code": p.country_code,
            "region_name": p.region_name,
            "centroid_lng": lng,
            "centroid_lat": lat,
            "geometry_geojson": p.geometry_geojson,
        })
    return result


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


@router.get("/{username}/trips", response_model=list[TripPublicSummary])
async def get_user_public_trips(
    username: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
):
    """All public trips for a user, pinned first then newest."""
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado")

    trips_result = await db.execute(
        select(Trip)
        .where(Trip.creator_id == user.id, Trip.visibility == "public")
        .order_by(Trip.is_pinned.desc(), Trip.start_date.desc().nullslast())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    trips_rows = trips_result.scalars().all()
    if not trips_rows:
        return []

    counts_result = await db.execute(
        select(TripPlace.trip_id, func.count(TripPlace.place_id).label("cnt"))
        .where(TripPlace.trip_id.in_([t.id for t in trips_rows]))
        .group_by(TripPlace.trip_id)
    )
    place_counts = {row.trip_id: row.cnt for row in counts_result.all()}

    return [
        {
            "id": t.id,
            "title": t.title,
            "start_date": t.start_date,
            "end_date": t.end_date,
            "cover_image_url": t.cover_image_url,
            "cover_colour": t.cover_colour,
            "place_count": place_counts.get(t.id, 0),
            "is_pinned": t.is_pinned,
        }
        for t in trips_rows
    ]


@router.get("/{username}/projects", response_model=list[ProjectPublicSummary])
async def get_user_public_projects(
    username: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
):
    """All public non-archived projects for a user, pinned first then by completion desc."""
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Não encontrado")

    projects_result = await db.execute(
        select(Project)
        .where(
            Project.creator_id == user.id,
            Project.visibility == "public",
            Project.is_archived.is_(False),
        )
        .order_by(Project.is_pinned.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    projects_rows = projects_result.scalars().all()
    if not projects_rows:
        return []

    project_ids = [p.id for p in projects_rows]

    target_rows = await db.execute(
        select(ProjectTargetPlace.project_id, func.count(ProjectTargetPlace.place_id))
        .where(ProjectTargetPlace.project_id.in_(project_ids))
        .group_by(ProjectTargetPlace.project_id)
    )
    target_counts: dict[int, int] = dict(target_rows.all())

    visited_rows = await db.execute(
        select(ProjectTargetPlace.project_id, func.count(distinct(TripPlace.place_id)))
        .join(TripPlace, TripPlace.place_id == ProjectTargetPlace.place_id)
        .join(Trip, Trip.id == TripPlace.trip_id)
        .where(
            ProjectTargetPlace.project_id.in_(project_ids),
            Trip.creator_id == user.id,
        )
        .group_by(ProjectTargetPlace.project_id)
    )
    visited_counts: dict[int, int] = dict(visited_rows.all())

    summaries = [
        {
            "id": p.id,
            "title": p.title,
            "cover_image_url": p.cover_image_url,
            "cover_colour": p.cover_colour,
            "target_place_count": target_counts.get(p.id, 0),
            "visited_place_count": visited_counts.get(p.id, 0),
            "is_pinned": p.is_pinned,
            "is_archived": p.is_archived,
        }
        for p in projects_rows
    ]
    # Sort by pinned first, then by completion percentage descending
    summaries.sort(
        key=lambda s: (
            not s["is_pinned"],
            -(s["visited_place_count"] / s["target_place_count"] if s["target_place_count"] else 0),
        )
    )
    return summaries


@router.get("/{username}", response_model=UserProfileResponse)
async def get_user_profile(
    username: str,
    requesting_user: User | None = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user = await get_user_by_username(db, username)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilizador não encontrado")

    # Unauthenticated access controlled by site settings
    if requesting_user is None:
        site = await _get_site_settings(db)
        if not site.allow_public_profiles_without_auth:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Inicia sessão para ver perfis de utilizadores.",
            )

    # ── Trips section ────────────────────────────────────────────────────────
    pinned_trips: list[dict] = []
    recent_trips: list[dict] = []
    total_public_trip_count = 0

    trips_result = await db.execute(
        select(Trip)
        .where(Trip.creator_id == user.id, Trip.visibility == "public")
        .order_by(Trip.is_pinned.desc(), Trip.start_date.desc().nullslast())
    )
    all_public_trips = trips_result.scalars().all()
    total_public_trip_count = len(all_public_trips)

    if all_public_trips:
        trip_ids = [t.id for t in all_public_trips]
        counts_result = await db.execute(
            select(TripPlace.trip_id, func.count(TripPlace.place_id).label("cnt"))
            .where(TripPlace.trip_id.in_(trip_ids))
            .group_by(TripPlace.trip_id)
        )
        trip_place_counts = {row.trip_id: row.cnt for row in counts_result.all()}

        pinned = [t for t in all_public_trips if t.is_pinned][:2]
        recent_pool = [t for t in all_public_trips if not t.is_pinned]
        recent_limit = max(0, 6 - len(pinned))
        # aim for even total
        total_shown = len(pinned) + min(len(recent_pool), recent_limit)
        if total_shown % 2 != 0 and recent_limit < len(recent_pool):
            recent_limit += 1
        recent = recent_pool[:recent_limit]

        def _trip_summary(t) -> dict:
            return {
                "id": t.id,
                "title": t.title,
                "start_date": t.start_date,
                "end_date": t.end_date,
                "cover_image_url": t.cover_image_url,
                "cover_colour": t.cover_colour,
                "place_count": trip_place_counts.get(t.id, 0),
                "is_pinned": t.is_pinned,
            }

        pinned_trips = [_trip_summary(t) for t in pinned]
        recent_trips = [_trip_summary(t) for t in recent]

    # ── Projects section ─────────────────────────────────────────────────────
    pinned_projects: list[dict] = []
    active_projects: list[dict] = []
    total_public_project_count = 0

    projects_result = await db.execute(
        select(Project)
        .where(
            Project.creator_id == user.id,
            Project.visibility == "public",
            Project.is_archived.is_(False),
        )
        .order_by(Project.is_pinned.desc())
    )
    all_public_projects = projects_result.scalars().all()
    total_public_project_count = len(all_public_projects)

    if all_public_projects:
        project_ids = [p.id for p in all_public_projects]

        target_rows = await db.execute(
            select(ProjectTargetPlace.project_id, func.count(ProjectTargetPlace.place_id))
            .where(ProjectTargetPlace.project_id.in_(project_ids))
            .group_by(ProjectTargetPlace.project_id)
        )
        target_counts: dict[int, int] = dict(target_rows.all())

        visited_rows = await db.execute(
            select(ProjectTargetPlace.project_id, func.count(distinct(TripPlace.place_id)))
            .join(TripPlace, TripPlace.place_id == ProjectTargetPlace.place_id)
            .join(Trip, Trip.id == TripPlace.trip_id)
            .where(
                ProjectTargetPlace.project_id.in_(project_ids),
                Trip.creator_id == user.id,
            )
            .group_by(ProjectTargetPlace.project_id)
        )
        visited_counts: dict[int, int] = dict(visited_rows.all())

        def _pct(p) -> float:
            t = target_counts.get(p.id, 0)
            return visited_counts.get(p.id, 0) / t if t else 0.0

        def _project_summary(p) -> dict:
            return {
                "id": p.id,
                "title": p.title,
                "cover_image_url": p.cover_image_url,
                "cover_colour": p.cover_colour,
                "target_place_count": target_counts.get(p.id, 0),
                "visited_place_count": visited_counts.get(p.id, 0),
                "is_pinned": p.is_pinned,
                "is_archived": p.is_archived,
            }

        pinned = [p for p in all_public_projects if p.is_pinned][:2]
        active_pool = sorted(
            [p for p in all_public_projects if not p.is_pinned],
            key=_pct,
            reverse=True,
        )
        active_limit = max(0, 4 - len(pinned))
        total_shown = len(pinned) + min(len(active_pool), active_limit)
        if total_shown % 2 != 0 and active_limit < len(active_pool):
            active_limit += 1
        active = active_pool[:active_limit]

        pinned_projects = [_project_summary(p) for p in pinned]
        active_projects = [_project_summary(p) for p in active]

    # ── Visited places & stats ────────────────────────────────────────────────
    visited_places: list[dict] = []
    visited_place_count: int | None = None
    stats: dict | None = None

    if user.visited_places_visibility == "public":
        visited_places = await _load_visited_places_public(db, user.id)
        visited_place_count = len(visited_places)

        # Country count from country_code
        country_codes = {p["country_code"] for p in visited_places if p.get("country_code")}
        total_countries = len(country_codes)

        # Average completion across all public active projects
        if all_public_projects and target_counts:  # type: ignore[possibly-undefined]
            pcts = []
            for p in all_public_projects:
                t = target_counts.get(p.id, 0)  # type: ignore[possibly-undefined]
                v = visited_counts.get(p.id, 0)  # type: ignore[possibly-undefined]
                pcts.append((v / t * 100) if t else 0.0)
            avg_completion = sum(pcts) / len(pcts) if pcts else 0.0
        else:
            avg_completion = 0.0

        stats = {
            "total_places": visited_place_count,
            "total_countries": total_countries,
            "avg_project_completion": round(avg_completion, 1),
        }

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "biography": user.biography,
        "website_url": user.website_url,
        "pinned_trips": pinned_trips,
        "recent_trips": recent_trips,
        "total_public_trip_count": total_public_trip_count,
        "pinned_projects": pinned_projects,
        "active_projects": active_projects,
        "total_public_project_count": total_public_project_count,
        "stats": stats,
        "visited_place_count": visited_place_count,
        "visited_places": visited_places,
    }


# Admin-only endpoints
@router.get("", response_model=list[UserResponse])
async def list_all_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
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
