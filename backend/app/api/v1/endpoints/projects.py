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
from app.core.security import generate_invite_token, generate_sharing_token
from app.models.notification import Notification
from app.models.project import Project, ProjectCollaborator, ProjectDirectVisit, ProjectMediaLink, ProjectSharedUser, ProjectTargetPlace
from app.models.trip import Trip, TripPlace, TripProject
from app.models.user import User
from app.schemas.project import MediaLinkCreate, PlaceImportRequest, ProjectCreate, ProjectDetailResponse, ProjectResponse, ProjectUpdate, SharedUserRequest, TripForPlaceCreate
from app.services.og_service import fetch_og_metadata
from app.services.storage_service import delete_from_imgbb, upload_cover_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


def _place_to_summary(
    place,
    visited: bool = False,
    visit_trips: list[dict] | None = None,
    direct_visit: bool = False,
) -> dict:
    lng = lat = None
    if place.centroid is not None:
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
        "visited": visited,
        "visit_trips": visit_trips or [],
        "direct_visit": direct_visit,
    }

_COVER_COLOURS = [
    "#7C3AED", "#6D28D9", "#4F46E5", "#0369A1", "#0891B2",
    "#0D9488", "#059669", "#65A30D", "#B45309", "#C2410C",
    "#BE185D", "#7E22CE",
]


async def _load_project(db: AsyncSession, project_id: int) -> Project | None:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.creator),
            selectinload(Project.collaborators).selectinload(ProjectCollaborator.user),
            selectinload(Project.target_places).selectinload(ProjectTargetPlace.place),
            selectinload(Project.shared_with).selectinload(ProjectSharedUser.user),
            selectinload(Project.media_links),
        )
        .where(Project.id == project_id)
    )
    return result.scalar_one_or_none()


async def _load_project_by_token(db: AsyncSession, token: str) -> Project | None:
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.creator),
            selectinload(Project.collaborators).selectinload(ProjectCollaborator.user),
            selectinload(Project.target_places).selectinload(ProjectTargetPlace.place),
            selectinload(Project.shared_with),
            selectinload(Project.media_links),
        )
        .where(Project.sharing_token == token, Project.visibility == "link")
    )
    return result.scalar_one_or_none()


def _check_project_access(project: Project, user: User) -> bool:
    if project.visibility == "public":
        return True
    if project.creator_id == user.id:
        return True
    accepted_ids = {c.user_id for c in project.collaborators if c.status == "accepted"}
    if user.id in accepted_ids:
        return True
    if project.visibility == "users":
        shared_ids = {s.user_id for s in project.shared_with}
        return user.id in shared_ids
    return False


async def _compute_progress(db: AsyncSession, project_id: int, project: Project) -> int:
    """Count distinct target places visited via associated trips or direct visit marks."""
    from sqlalchemy import text as sqla_text
    result = await db.execute(
        sqla_text("""
            SELECT COUNT(DISTINCT place_id) FROM (
                SELECT tpl.place_id
                FROM trip_projects tp
                JOIN trip_places tpl ON tpl.trip_id = tp.trip_id
                JOIN project_target_places ptp ON ptp.place_id = tpl.place_id
                    AND ptp.project_id = tp.project_id
                WHERE tp.project_id = :pid
                UNION
                SELECT pdv.place_id
                FROM project_direct_visits pdv
                JOIN project_target_places ptp ON ptp.place_id = pdv.place_id
                    AND ptp.project_id = pdv.project_id
                WHERE pdv.project_id = :pid
            ) combined
        """),
        {"pid": project_id},
    )
    return result.scalar() or 0


async def _compute_place_visit_info(
    db: AsyncSession,
    project_id: int,
    target_place_ids: set[int],
    public_only: bool = False,
) -> tuple[dict[int, list[dict]], set[int]]:
    """Return (place_id -> [trip summary], direct_visit_place_ids).

    When public_only is True (unauthenticated shared view), private trips are
    excluded so that private trip titles and destinations do not leak.
    """
    from collections import defaultdict
    visit_map: dict[int, list[dict]] = defaultdict(list)

    if target_place_ids:
        q = (
            select(
                TripPlace.place_id,
                Trip.id.label("trip_id"),
                Trip.title.label("trip_title"),
                Trip.start_date,
            )
            .join(TripProject, TripProject.trip_id == TripPlace.trip_id)
            .join(Trip, Trip.id == TripPlace.trip_id)
            .where(
                TripProject.project_id == project_id,
                TripPlace.place_id.in_(target_place_ids),
            )
            .distinct()
        )
        if public_only:
            q = q.where(Trip.visibility != "private")
        rows = await db.execute(q)
        for r in rows.all():
            visit_map[r.place_id].append({"id": r.trip_id, "title": r.trip_title, "start_date": r.start_date})

    direct_rows = await db.execute(
        select(ProjectDirectVisit.place_id)
        .where(ProjectDirectVisit.project_id == project_id)
    )
    direct_ids = {r.place_id for r in direct_rows.all()}

    return dict(visit_map), direct_ids


async def _get_associated_trips(
    db: AsyncSession,
    project_id: int,
    target_place_ids: set[int],
    public_only: bool = False,
) -> list[dict]:
    """Return list of trips associated with the project, each with which target places they cover.

    When public_only is True, private trips are excluded from the list.
    """
    q = (
        select(Trip.id, Trip.title, Trip.start_date, Trip.end_date)
        .join(TripProject, TripProject.trip_id == Trip.id)
        .where(TripProject.project_id == project_id)
        .order_by(Trip.start_date.asc().nullslast())
    )
    if public_only:
        q = q.where(Trip.visibility != "private")
    trip_rows = await db.execute(q)
    trips: dict[int, dict] = {
        r.id: {"id": r.id, "title": r.title, "start_date": r.start_date, "end_date": r.end_date, "covered_place_ids": []}
        for r in trip_rows.all()
    }
    if trips and target_place_ids:
        place_rows = await db.execute(
            select(TripPlace.trip_id, TripPlace.place_id)
            .where(
                TripPlace.trip_id.in_(trips.keys()),
                TripPlace.place_id.in_(target_place_ids),
            )
        )
        for r in place_rows.all():
            if r.trip_id in trips:
                trips[r.trip_id]["covered_place_ids"].append(r.place_id)
    return list(trips.values())


def _project_to_response(project: Project, visited_count: int = 0, include_pending: bool = False) -> dict:
    if include_pending:
        collaborators_list = [c for c in project.collaborators if c.status != "declined"]
    else:
        collaborators_list = [c for c in project.collaborators if c.status == "accepted"]
    return {
        "id": project.id,
        "title": project.title,
        "description": project.description,
        "goal_description": project.goal_description,
        "cover_image_url": project.cover_image_url,
        "cover_image_generating": project.cover_image_generating,
        "cover_colour": project.cover_colour,
        "visibility": project.visibility,
        "sharing_token": project.sharing_token if project.visibility in ("link", "users") else None,
        "creator_id": project.creator_id,
        "creator_username": project.creator.username,
        "creator_display_name": project.creator.display_name,
        "collaborators": [
            {
                "id": c.id,
                "user_id": c.user_id,
                "username": c.user.username,
                "display_name": c.user.display_name,
                "avatar_url": c.user.avatar_url,
                "status": c.status,
            }
            for c in collaborators_list
        ],
        "target_place_count": len(project.target_places),
        "visited_place_count": visited_count,
        "media_links": [
            {
                "id": m.id,
                "url": m.url,
                "og_title": m.og_title,
                "og_description": m.og_description,
                "og_image_url": m.og_image_url,
                "og_site_name": m.og_site_name,
            }
            for m in project.media_links
        ],
    }


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = Project(
        creator_id=current_user.id,
        title=data.title,
        description=data.description,
        goal_description=data.goal_description,
        visibility=data.visibility or current_user.default_project_visibility,
        cover_colour=random.choice(_COVER_COLOURS),
    )
    if project.visibility in ("link", "users"):
        project.sharing_token = generate_sharing_token()
    db.add(project)
    await db.flush()
    project = await _load_project(db, project.id)
    return _project_to_response(project)


@router.get("", response_model=list[ProjectResponse])
async def list_my_projects(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.creator),
            selectinload(Project.collaborators).selectinload(ProjectCollaborator.user),
            selectinload(Project.target_places),
            selectinload(Project.media_links),
        )
        .where(
            or_(
                Project.creator_id == current_user.id,
                Project.id.in_(
                    select(ProjectCollaborator.project_id).where(
                        ProjectCollaborator.user_id == current_user.id,
                        ProjectCollaborator.status == "accepted",
                    )
                ),
            )
        )
        .order_by(Project.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    projects = result.scalars().all()
    if not projects:
        return []

    project_ids = [p.id for p in projects]

    # Batch-compute visited counts via trip_projects + direct visits
    from sqlalchemy import text as sqla_text
    count_rows = await db.execute(
        sqla_text("""
            SELECT project_id, COUNT(DISTINCT place_id) AS cnt FROM (
                SELECT tp.project_id, tpl.place_id
                FROM trip_projects tp
                JOIN trip_places tpl ON tpl.trip_id = tp.trip_id
                JOIN project_target_places ptp ON ptp.place_id = tpl.place_id
                    AND ptp.project_id = tp.project_id
                WHERE tp.project_id = ANY(:pids)
                UNION
                SELECT pdv.project_id, pdv.place_id
                FROM project_direct_visits pdv
                JOIN project_target_places ptp ON ptp.place_id = pdv.place_id
                    AND ptp.project_id = pdv.project_id
                WHERE pdv.project_id = ANY(:pids)
            ) combined
            GROUP BY project_id
        """),
        {"pids": project_ids},
    )
    visited_by_project: dict[int, int] = {r.project_id: r.cnt for r in count_rows.all()}

    return [_project_to_response(p, visited_by_project.get(p.id, 0)) for p in projects]


@router.get("/shared/{token}", response_model=ProjectDetailResponse)
async def get_shared_project(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    project = await _load_project_by_token(db, token)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado ou link inválido")
    target_place_ids = {tp.place_id for tp in project.target_places}
    visit_map, direct_ids = await _compute_place_visit_info(db, project.id, target_place_ids, public_only=True)
    visited_count = len({pid for pid in target_place_ids if pid in visit_map or pid in direct_ids})
    assoc_trips = await _get_associated_trips(db, project.id, target_place_ids, public_only=True)
    data = _project_to_response(project, visited_count)
    data["collaborators"] = []
    data["target_places"] = [
        _place_to_summary(
            tp.place,
            visited=tp.place_id in visit_map or tp.place_id in direct_ids,
            visit_trips=visit_map.get(tp.place_id, []),
            direct_visit=tp.place_id in direct_ids,
        )
        for tp in project.target_places
    ]
    data["associated_trips"] = assoc_trips
    return data


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not _check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    # Safety timeout: if generating flag is stuck for > 5 min, clear it.
    if project.cover_image_generating:
        age = datetime.now(timezone.utc) - project.updated_at.replace(tzinfo=timezone.utc)
        if age > timedelta(minutes=5):
            project.cover_image_generating = False
            await db.flush()

    is_creator = project.creator_id == current_user.id
    target_place_ids = {tp.place_id for tp in project.target_places}
    visit_map, direct_ids = await _compute_place_visit_info(db, project_id, target_place_ids)
    visited_count = len({pid for pid in target_place_ids if pid in visit_map or pid in direct_ids})
    assoc_trips = await _get_associated_trips(db, project_id, target_place_ids)
    data = _project_to_response(project, visited_count, include_pending=is_creator)
    data["target_places"] = [
        _place_to_summary(
            tp.place,
            visited=tp.place_id in visit_map or tp.place_id in direct_ids,
            visit_trips=visit_map.get(tp.place_id, []),
            direct_visit=tp.place_id in direct_ids,
        )
        for tp in project.target_places
    ]
    data["shared_with"] = (
        [
            {
                "id": s.id,
                "user_id": s.user_id,
                "username": s.user.username,
                "display_name": s.user.display_name,
                "avatar_url": s.user.avatar_url,
            }
            for s in project.shared_with
        ]
        if is_creator else []
    )
    data["associated_trips"] = assoc_trips
    return data


@router.post("/{project_id}/shared-users", status_code=status.HTTP_201_CREATED)
async def add_project_shared_user(
    project_id: int,
    data: SharedUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    from app.services.user_service import get_user_by_username
    target = await get_user_by_username(db, data.username)
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode adicionar-se a si próprio")

    existing = await db.execute(
        select(ProjectSharedUser).where(
            ProjectSharedUser.project_id == project_id,
            ProjectSharedUser.user_id == target.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Utilizador já tem acesso")

    db.add(ProjectSharedUser(project_id=project_id, user_id=target.id))
    return {"detail": "Acesso concedido"}


@router.delete("/{project_id}/shared-users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_shared_user(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    result = await db.execute(
        select(ProjectSharedUser).where(
            ProjectSharedUser.project_id == project_id,
            ProjectSharedUser.user_id == user_id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry:
        await db.delete(entry)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if project.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sem permissão")
    if project.cover_image_delete_url:
        background_tasks.add_task(delete_from_imgbb, project.cover_image_delete_url)
    await db.delete(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await _load_project(db, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    if project.visibility in ("link", "users") and not project.sharing_token:
        project.sharing_token = generate_sharing_token()
    await db.flush()
    project = await _load_project(db, project_id)
    return _project_to_response(project)


@router.post("/{project_id}/cover", response_model=ProjectResponse)
@limiter.limit("10/minute")
async def upload_project_cover(
    request: Request,
    project_id: int,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    content = await file.read()
    try:
        url, delete_url = await upload_cover_image(content, file.filename or "cover.jpg")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    old_delete_url = project.cover_image_delete_url
    project.cover_image_url = url
    project.cover_image_delete_url = delete_url
    project.cover_image_generating = False
    await db.flush()

    if old_delete_url:
        background_tasks.add_task(delete_from_imgbb, old_delete_url)

    project = await _load_project(db, project_id)
    return _project_to_response(project)


@router.delete("/{project_id}/cover", response_model=ProjectResponse)
async def delete_project_cover(
    project_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    old_delete_url = project.cover_image_delete_url
    project.cover_image_url = None
    project.cover_image_delete_url = None
    project.cover_image_generating = False
    await db.flush()

    if old_delete_url:
        background_tasks.add_task(delete_from_imgbb, old_delete_url)

    project = await _load_project(db, project_id)
    return _project_to_response(project)


@router.post("/{project_id}/generate-cover", response_model=ProjectResponse)
@limiter.limit("5/hour")
async def generate_project_cover(
    request: Request,
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        project = await db.get(Project, project_id)
        if not project or project.creator_id != current_user.id:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")

        from app.workers.celery_app import celery_app

        project.cover_image_generating = True
        await db.flush()

        try:
            celery_app.send_task(
                "generate_cover_image",
                args=[project_id, "project", project.title, project.description],
            )
        except Exception as exc:
            logger.error("Failed to dispatch cover generation task for project %d: %s", project_id, exc)
            project.cover_image_generating = False
            await db.flush()

        project = await _load_project(db, project_id)
        return _project_to_response(project)
    except HTTPException:
        raise
    except Exception:
        logger.error("generate_project_cover error: %s", traceback.format_exc())
        raise


@router.post("/{project_id}/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_target_place(
    project_id: int,
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    existing = await db.execute(
        select(ProjectTargetPlace).where(
            ProjectTargetPlace.project_id == project_id,
            ProjectTargetPlace.place_id == place_id,
        )
    )
    if existing.scalar_one_or_none():
        return
    db.add(ProjectTargetPlace(project_id=project_id, place_id=place_id))


@router.delete("/{project_id}/places/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_target_place(
    project_id: int,
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    result = await db.execute(
        select(ProjectTargetPlace).where(
            ProjectTargetPlace.project_id == project_id,
            ProjectTargetPlace.place_id == place_id,
        )
    )
    tp = result.scalar_one_or_none()
    if tp:
        await db.delete(tp)


@router.post("/{project_id}/collaborators/{username}", status_code=status.HTTP_201_CREATED)
async def invite_collaborator(
    project_id: int,
    username: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    from app.services.user_service import get_user_by_username
    invitee = await get_user_by_username(db, username)
    if not invitee:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if invitee.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não pode convidar-se a si próprio")

    existing = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == invitee.id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Utilizador já convidado")

    db.add(ProjectCollaborator(
        project_id=project_id,
        user_id=invitee.id,
        invite_token=generate_invite_token(),
        status="pending",
    ))
    db.add(Notification(
        recipient_id=invitee.id,
        notification_type="project_invite",
        entity_type="project",
        entity_id=project_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} convidou-o para o projeto «{project.title}»",
    ))
    return {"detail": "Convite enviado"}


@router.delete("/{project_id}/collaborators/{collaborator_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collaborator(
    project_id: int,
    collaborator_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.id == collaborator_id,
            ProjectCollaborator.project_id == project_id,
        )
    )
    collaborator = result.scalar_one_or_none()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado")

    if collaborator.status == "accepted":
        db.add(Notification(
            recipient_id=collaborator.user_id,
            notification_type="removed_from_project",
            entity_type="project",
            entity_id=project_id,
            actor_id=current_user.id,
            message=f"Foste removido do projeto «{project.title}»",
        ))
    await db.delete(collaborator)


@router.post("/{project_id}/collaborators/accept-me", status_code=status.HTTP_200_OK)
async def accept_project_invite_as_me(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == current_user.id,
            ProjectCollaborator.status == "pending",
        )
    )
    collaborator = result.scalar_one_or_none()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Convite pendente não encontrado")
    collaborator.status = "accepted"
    project = await db.get(Project, project_id)
    db.add(Notification(
        recipient_id=project.creator_id,
        notification_type="invite_accepted",
        entity_type="project",
        entity_id=project_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} aceitou o convite para o projeto «{project.title}»",
    ))
    return {"detail": "Convite aceite"}


@router.post("/{project_id}/collaborators/leave-me", status_code=status.HTTP_200_OK)
async def leave_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == current_user.id,
            ProjectCollaborator.status == "accepted",
        )
    )
    collaborator = result.scalar_one_or_none()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Não és colaborador aceite deste projeto")

    project = await db.get(Project, project_id)
    db.add(Notification(
        recipient_id=project.creator_id,
        notification_type="collaborator_left",
        entity_type="project",
        entity_id=project_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} saiu do projeto «{project.title}»",
    ))
    await db.delete(collaborator)
    return {"detail": "Saíste do projeto"}


@router.post("/{project_id}/collaborators/decline-me", status_code=status.HTTP_200_OK)
async def decline_project_invite_as_me(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(ProjectCollaborator).where(
            ProjectCollaborator.project_id == project_id,
            ProjectCollaborator.user_id == current_user.id,
            ProjectCollaborator.status == "pending",
        )
    )
    collaborator = result.scalar_one_or_none()
    if not collaborator:
        raise HTTPException(status_code=404, detail="Convite pendente não encontrado")
    collaborator.status = "declined"
    project = await db.get(Project, project_id)
    db.add(Notification(
        recipient_id=project.creator_id,
        notification_type="invite_declined",
        entity_type="project",
        entity_id=project_id,
        actor_id=current_user.id,
        message=f"{current_user.display_name} recusou o convite para o projeto «{project.title}»",
    ))
    return {"detail": "Convite recusado"}


@router.post("/{project_id}/import-places", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
async def import_places_from_text(
    request: Request,
    project_id: int,
    data: PlaceImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Attempt to match each line to an OSM place via Nominatim. Returns matches for confirmation."""
    import asyncio

    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    from app.services.osm_service import nominatim_to_place_data, search_nominatim
    from app.schemas.place import NominatimMatchResult, PlaceSearchResult

    lines = [l.strip() for l in data.lines[:50] if l.strip()]

    semaphore = asyncio.Semaphore(3)

    async def lookup(line: str) -> tuple[str, list]:
        async with semaphore:
            return line, await search_nominatim(line, ["pt", "es"])

    raw = await asyncio.gather(*[lookup(line) for line in lines])

    results = []
    for line, osm_results in raw:
        if osm_results:
            best = osm_results[0]
            d = nominatim_to_place_data(best)
            match = PlaceSearchResult(
                osm_id=d["osm_id"],
                osm_type=d["osm_type"],
                name=d["name"],
                display_name=d["display_name"],
                place_type=d["place_type"],
                country_code=d.get("country_code"),
                centroid_lng=d["centroid_lng"],
                centroid_lat=d["centroid_lat"],
            )
            alternatives = []
            for r in osm_results[1:4]:
                rd = nominatim_to_place_data(r)
                alternatives.append(PlaceSearchResult(
                    osm_id=rd["osm_id"],
                    osm_type=rd["osm_type"],
                    name=rd["name"],
                    display_name=rd["display_name"],
                    place_type=rd["place_type"],
                    country_code=rd.get("country_code"),
                    centroid_lng=rd["centroid_lng"],
                    centroid_lat=rd["centroid_lat"],
                ))
            results.append(NominatimMatchResult(query=line, match=match, confidence=0.9, alternatives=alternatives))
        else:
            results.append(NominatimMatchResult(query=line, match=None, confidence=None))
    return results


@router.post("/{project_id}/media", response_model=ProjectDetailResponse)
async def add_project_media(
    project_id: int,
    data: MediaLinkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    og = await fetch_og_metadata(data.url)
    link = ProjectMediaLink(
        project_id=project_id,
        url=data.url,
        og_title=og.get("title"),
        og_description=og.get("description"),
        og_image_url=og.get("image"),
        og_site_name=og.get("site_name"),
    )
    db.add(link)
    await db.flush()

    project = await _load_project(db, project_id)
    visited = await _compute_progress(db, project_id, project)
    return _project_to_response(project, visited, include_pending=True)


@router.delete("/{project_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_media(
    project_id: int,
    media_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    result = await db.execute(
        select(ProjectMediaLink).where(
            ProjectMediaLink.id == media_id,
            ProjectMediaLink.project_id == project_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link não encontrado")

    await db.delete(link)


# ── Project-Trip association endpoints ────────────────────────────────────────

@router.post("/{project_id}/trips/{trip_id}", response_model=ProjectDetailResponse)
async def associate_trip_with_project(
    project_id: int,
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Associate a trip with a project (from the project side)."""
    project = await _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not _check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")

    existing = await db.execute(
        select(TripProject).where(TripProject.trip_id == trip_id, TripProject.project_id == project_id)
    )
    if not existing.scalar_one_or_none():
        db.add(TripProject(trip_id=trip_id, project_id=project_id))
        await db.flush()

    project = await _load_project(db, project_id)
    target_place_ids = {tp.place_id for tp in project.target_places}
    visit_map, direct_ids = await _compute_place_visit_info(db, project_id, target_place_ids)
    visited_count = len({pid for pid in target_place_ids if pid in visit_map or pid in direct_ids})
    assoc_trips = await _get_associated_trips(db, project_id, target_place_ids)
    data = _project_to_response(project, visited_count, include_pending=True)
    data["target_places"] = [
        _place_to_summary(
            tp.place,
            visited=tp.place_id in visit_map or tp.place_id in direct_ids,
            visit_trips=visit_map.get(tp.place_id, []),
            direct_visit=tp.place_id in direct_ids,
        )
        for tp in project.target_places
    ]
    data["associated_trips"] = assoc_trips
    return data


@router.delete("/{project_id}/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disassociate_trip_from_project(
    project_id: int,
    trip_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    accepted_ids = {c.user_id for c in (await db.execute(
        select(ProjectCollaborator).where(ProjectCollaborator.project_id == project_id, ProjectCollaborator.status == "accepted")
    )).scalars().all()}
    if project.creator_id != current_user.id and current_user.id not in accepted_ids:
        raise HTTPException(status_code=403, detail="Acesso negado")

    trip = await db.get(Trip, trip_id)
    if not trip or trip.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Só o criador da viagem pode desassociá-la")

    result = await db.execute(
        select(TripProject).where(TripProject.trip_id == trip_id, TripProject.project_id == project_id)
    )
    assoc = result.scalar_one_or_none()
    if assoc:
        await db.delete(assoc)


# ── Direct visit endpoints ─────────────────────────────────────────────────────

@router.post("/{project_id}/target-places/{place_id}/visit", response_model=ProjectDetailResponse)
async def mark_place_visited(
    project_id: int,
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Directly mark a target place as visited without creating a trip."""
    project = await _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not _check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")

    # Verify the place is actually a target place of this project
    is_target = any(tp.place_id == place_id for tp in project.target_places)
    if not is_target:
        raise HTTPException(status_code=404, detail="Lugar não é um objetivo deste projeto")

    existing = await db.execute(
        select(ProjectDirectVisit).where(
            ProjectDirectVisit.project_id == project_id,
            ProjectDirectVisit.place_id == place_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(ProjectDirectVisit(
            project_id=project_id,
            place_id=place_id,
            marked_by_user_id=current_user.id,
        ))
        await db.flush()

    project = await _load_project(db, project_id)
    target_place_ids = {tp.place_id for tp in project.target_places}
    visit_map, direct_ids = await _compute_place_visit_info(db, project_id, target_place_ids)
    visited_count = len({pid for pid in target_place_ids if pid in visit_map or pid in direct_ids})
    assoc_trips = await _get_associated_trips(db, project_id, target_place_ids)
    data = _project_to_response(project, visited_count, include_pending=True)
    data["target_places"] = [
        _place_to_summary(
            tp.place,
            visited=tp.place_id in visit_map or tp.place_id in direct_ids,
            visit_trips=visit_map.get(tp.place_id, []),
            direct_visit=tp.place_id in direct_ids,
        )
        for tp in project.target_places
    ]
    data["associated_trips"] = assoc_trips
    return data


@router.delete("/{project_id}/target-places/{place_id}/visit", status_code=status.HTTP_204_NO_CONTENT)
async def unmark_place_visited(
    project_id: int,
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    accepted_ids = {c.user_id for c in (await db.execute(
        select(ProjectCollaborator).where(ProjectCollaborator.project_id == project_id, ProjectCollaborator.status == "accepted")
    )).scalars().all()}
    if project.creator_id != current_user.id and current_user.id not in accepted_ids:
        raise HTTPException(status_code=403, detail="Acesso negado")

    result = await db.execute(
        select(ProjectDirectVisit).where(
            ProjectDirectVisit.project_id == project_id,
            ProjectDirectVisit.place_id == place_id,
        )
    )
    visit = result.scalar_one_or_none()
    if visit:
        if visit.marked_by_user_id != current_user.id and project.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sem permissão para remover esta marcação")
        await db.delete(visit)


# ── Way 3B: create a trip for a specific target place ─────────────────────────

@router.post("/{project_id}/target-places/{place_id}/trip", response_model=ProjectDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_trip_for_place(
    project_id: int,
    place_id: int,
    data: TripForPlaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Way 3B: create a minimal trip, add the place, associate with project, notify other members."""
    from app.core.security import generate_invite_token as gen_token
    from app.models.notification import Notification

    project = await _load_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if project.creator_id != current_user.id:
        accepted_ids = {c.user_id for c in project.collaborators if c.status == "accepted"}
        if current_user.id not in accepted_ids:
            raise HTTPException(status_code=403, detail="Acesso negado")

    is_target = any(tp.place_id == place_id for tp in project.target_places)
    if not is_target:
        raise HTTPException(status_code=404, detail="Lugar não é um objetivo deste projeto")

    # Create the trip
    from app.models.trip import Trip as TripModel, TripPlace as TripPlaceModel, TripProject as TripProjectModel, TripCompanion as TripCompanionModel
    import random as _rand
    trip = TripModel(
        creator_id=current_user.id,
        title=data.title,
        description=data.description,
        visibility=current_user.default_trip_visibility,
        cover_colour=_rand.choice(_COVER_COLOURS),
    )
    db.add(trip)
    await db.flush()

    # Add the place to the trip
    db.add(TripPlaceModel(trip_id=trip.id, place_id=place_id))

    # Associate the trip with the project
    db.add(TripProjectModel(trip_id=trip.id, project_id=project_id))
    await db.flush()

    # Add other project members as accepted companions and notify them
    member_ids = {project.creator_id} | {c.user_id for c in project.collaborators if c.status == "accepted"}
    member_ids.discard(current_user.id)

    for uid in member_ids:
        companion = TripCompanionModel(
            trip_id=trip.id,
            user_id=uid,
            invite_token=gen_token(),
            status="accepted",
        )
        db.add(companion)
        db.add(Notification(
            recipient_id=uid,
            notification_type="added_to_trip_via_project",
            entity_type="trip",
            entity_id=trip.id,
            actor_id=current_user.id,
            message=f"Foste adicionado à viagem \"{data.title}\" no projeto \"{project.title}\". Completa os detalhes quando quiseres.",
        ))

    await db.flush()

    project = await _load_project(db, project_id)
    target_place_ids = {tp.place_id for tp in project.target_places}
    visit_map, direct_ids = await _compute_place_visit_info(db, project_id, target_place_ids)
    visited_count = len({pid for pid in target_place_ids if pid in visit_map or pid in direct_ids})
    assoc_trips = await _get_associated_trips(db, project_id, target_place_ids)
    data_resp = _project_to_response(project, visited_count, include_pending=True)
    data_resp["target_places"] = [
        _place_to_summary(
            tp.place,
            visited=tp.place_id in visit_map or tp.place_id in direct_ids,
            visit_trips=visit_map.get(tp.place_id, []),
            direct_visit=tp.place_id in direct_ids,
        )
        for tp in project.target_places
    ]
    data_resp["associated_trips"] = assoc_trips
    data_resp["new_trip_id"] = trip.id
    return data_resp


@router.post("/{project_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def pin_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if project.is_pinned:
        return
    pinned_count = await db.scalar(
        select(func.count(Project.id)).where(
            Project.creator_id == current_user.id,
            Project.is_pinned.is_(True),
        )
    )
    if (pinned_count or 0) >= 2:
        raise HTTPException(
            status_code=400,
            detail="Já tens 2 projetos fixados. Remove um para fixar este.",
        )
    project.is_pinned = True
    await db.flush()


@router.delete("/{project_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def unpin_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    project.is_pinned = False
    await db.flush()


@router.post("/{project_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
async def archive_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    project.is_archived = True
    project.is_pinned = False  # unpin on archive
    await db.flush()


@router.post("/{project_id}/unarchive", status_code=status.HTTP_204_NO_CONTENT)
async def unarchive_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    project.is_archived = False
    await db.flush()
