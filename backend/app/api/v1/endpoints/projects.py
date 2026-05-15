import logging
import random
import traceback
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
from app.core.security import generate_invite_token, generate_sharing_token
from app.models.notification import Notification
from app.models.project import Project, ProjectCollaborator, ProjectSharedUser, ProjectTargetPlace
from app.models.trip import Trip, TripPlace
from app.models.user import User
from app.schemas.project import PlaceImportRequest, ProjectCreate, ProjectDetailResponse, ProjectResponse, ProjectUpdate
from app.services.storage_service import delete_from_imgbb, upload_cover_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


def _place_to_summary(place) -> dict:
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
        "name": place.name,
        "name_pt": place.name_pt,
        "place_type": place.place_type,
        "country_code": place.country_code,
        "region_name": place.region_name,
        "centroid_lng": lng,
        "centroid_lat": lat,
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
    """Count distinct target places visited by project participants (creator + accepted collaborators)."""
    target_ids = [tp.place_id for tp in project.target_places]
    if not target_ids:
        return 0

    participant_ids = [project.creator_id] + [
        c.user_id for c in project.collaborators if c.status == "accepted"
    ]

    result = await db.execute(
        select(func.count(func.distinct(TripPlace.place_id)))
        .join(TripPlace.trip)
        .where(
            TripPlace.place_id.in_(target_ids),
            Trip.creator_id.in_(participant_ids),
        )
    )
    return result.scalar() or 0


def _project_to_response(project: Project, visited_count: int = 0, include_pending: bool = False) -> dict:
    collaborators_list = project.collaborators if include_pending else [c for c in project.collaborators if c.status == "accepted"]
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
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    result = await db.execute(
        select(Project)
        .options(
            selectinload(Project.creator),
            selectinload(Project.collaborators).selectinload(ProjectCollaborator.user),
            selectinload(Project.target_places),
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

    # Batch-compute visited counts without N+1 queries.
    # Collect all participant user IDs and target place IDs across all projects.
    project_participants: dict[int, set[int]] = {}
    project_target_ids: dict[int, set[int]] = {}
    all_participant_ids: set[int] = set()
    all_target_place_ids: set[int] = set()

    for p in projects:
        pids = {p.creator_id} | {c.user_id for c in p.collaborators if c.status == "accepted"}
        tids = {tp.place_id for tp in p.target_places}
        project_participants[p.id] = pids
        project_target_ids[p.id] = tids
        all_participant_ids.update(pids)
        all_target_place_ids.update(tids)

    visited_pairs: set[tuple[int, int]] = set()
    if all_participant_ids and all_target_place_ids:
        visited_result = await db.execute(
            select(Trip.creator_id, TripPlace.place_id)
            .join(TripPlace, TripPlace.trip_id == Trip.id)
            .where(
                Trip.creator_id.in_(list(all_participant_ids)),
                TripPlace.place_id.in_(list(all_target_place_ids)),
            )
            .distinct()
        )
        visited_pairs = set(visited_result.all())

    def _visited_count(p: Project) -> int:
        pids = project_participants[p.id]
        tids = project_target_ids[p.id]
        return sum(1 for (uid, pid) in visited_pairs if uid in pids and pid in tids)

    return [_project_to_response(p, _visited_count(p)) for p in projects]


@router.get("/shared/{token}", response_model=ProjectDetailResponse)
async def get_shared_project(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    project = await _load_project_by_token(db, token)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado ou link inválido")
    visited = await _compute_progress(db, project.id, project)
    data = _project_to_response(project, visited)
    data["target_places"] = [_place_to_summary(tp.place) for tp in project.target_places]
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
    visited = await _compute_progress(db, project_id, project)
    data = _project_to_response(project, visited, include_pending=is_creator)
    data["target_places"] = [_place_to_summary(tp.place) for tp in project.target_places]
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
    return data


@router.post("/{project_id}/shared-users", status_code=status.HTTP_201_CREATED)
async def add_project_shared_user(
    project_id: int,
    data: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    from app.services.user_service import get_user_by_username
    username = data.get("username", "")
    target = await get_user_by_username(db, username)
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
async def upload_project_cover(
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


@router.post("/{project_id}/generate-cover", response_model=ProjectResponse)
async def generate_project_cover(
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
async def import_places_from_text(
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
