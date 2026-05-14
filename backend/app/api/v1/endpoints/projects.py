import logging
import random

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.dependencies import get_current_user
from app.core.security import generate_invite_token, generate_sharing_token
from app.models.notification import Notification
from app.models.project import Project, ProjectCollaborator, ProjectTargetPlace
from app.models.trip import Trip, TripPlace
from app.models.user import User
from app.schemas.project import PlaceImportRequest, ProjectCreate, ProjectDetailResponse, ProjectResponse, ProjectUpdate
from app.services.storage_service import delete_object, upload_cover_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])

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
            selectinload(Project.shared_with),
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


def _project_to_response(project: Project, visited_count: int = 0) -> dict:
    accepted = [c for c in project.collaborators if c.status == "accepted"]
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
            for c in accepted
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
    if project.visibility == "link":
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
    return [_project_to_response(p) for p in result.scalars().all()]


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
    data["target_places"] = [
        {
            "id": tp.place.id,
            "name": tp.place.name,
            "name_pt": tp.place.name_pt,
            "place_type": tp.place.place_type,
            "country_code": tp.place.country_code,
            "region_name": tp.place.region_name,
        }
        for tp in project.target_places
    ]
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
    visited = await _compute_progress(db, project_id, project)
    data = _project_to_response(project, visited)
    data["target_places"] = [
        {
            "id": tp.place.id,
            "name": tp.place.name,
            "name_pt": tp.place.name_pt,
            "place_type": tp.place.place_type,
            "country_code": tp.place.country_code,
            "region_name": tp.place.region_name,
        }
        for tp in project.target_places
    ]
    return data


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
    if project.visibility == "link" and not project.sharing_token:
        project.sharing_token = generate_sharing_token()
    await db.flush()
    project = await _load_project(db, project_id)
    return _project_to_response(project)


@router.post("/{project_id}/cover", response_model=ProjectResponse)
async def upload_project_cover(
    project_id: int,
    file: UploadFile,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    old_url = project.cover_image_url
    content = await file.read()
    url = await upload_cover_image(
        current_user.id, "project", project_id, content,
        file.filename or "cover.jpg",
        file.content_type or "image/jpeg",
    )
    project.cover_image_url = url
    project.cover_image_generating = False
    await db.flush()

    if old_url:
        try:
            await delete_object(old_url)
        except Exception:
            logger.warning("Failed to delete old cover image: %s", old_url)

    project = await _load_project(db, project_id)
    return _project_to_response(project)


@router.post("/{project_id}/generate-cover", response_model=ProjectResponse)
async def generate_project_cover(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    from app.workers.image_worker import _build_prompt, _fetch_pollinations_image
    from app.services.storage_service import upload_bytes_as_image

    old_url = project.cover_image_url
    prompt = _build_prompt(project.title, project.description)
    image_bytes = await _fetch_pollinations_image(prompt)
    if not image_bytes:
        raise HTTPException(status_code=502, detail="Não foi possível gerar a imagem. Tenta novamente.")

    url = await upload_bytes_as_image(
        current_user.id, "project", project_id, image_bytes, "ai_cover.jpg", "image/jpeg"
    )
    project.cover_image_url = url
    project.cover_image_generating = False
    await db.flush()

    if old_url:
        try:
            await delete_object(old_url)
        except Exception:
            logger.warning("Failed to delete old cover image: %s", old_url)

    project = await _load_project(db, project_id)
    return _project_to_response(project)


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


@router.post("/{project_id}/import-places", status_code=status.HTTP_202_ACCEPTED)
async def import_places_from_text(
    project_id: int,
    data: PlaceImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    """Attempt to match each line to an OSM place via Nominatim. Returns matches for confirmation."""
    project = await db.get(Project, project_id)
    if not project or project.creator_id != current_user.id:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    from app.services.osm_service import nominatim_to_place_data, search_nominatim
    from app.schemas.place import NominatimMatchResult, PlaceSearchResult

    results = []
    for line in data.lines[:50]:
        line = line.strip()
        if not line:
            continue
        osm_results = await search_nominatim(line, ["pt", "es"])
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
            alternatives = [
                PlaceSearchResult(
                    osm_id=nominatim_to_place_data(r)["osm_id"],
                    osm_type=nominatim_to_place_data(r)["osm_type"],
                    name=nominatim_to_place_data(r)["name"],
                    display_name=nominatim_to_place_data(r)["display_name"],
                    place_type=nominatim_to_place_data(r)["place_type"],
                    country_code=nominatim_to_place_data(r).get("country_code"),
                    centroid_lng=nominatim_to_place_data(r)["centroid_lng"],
                    centroid_lat=nominatim_to_place_data(r)["centroid_lat"],
                )
                for r in osm_results[1:4]
            ]
            results.append(NominatimMatchResult(query=line, match=match, confidence=0.9, alternatives=alternatives))
        else:
            results.append(NominatimMatchResult(query=line, match=None, confidence=None))
    return results
