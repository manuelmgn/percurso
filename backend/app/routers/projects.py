from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, Project, Place
from app.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse, BulkImportRequest, BulkImportResponse, BulkImportLine, PlaceSearchResult, TripListResponse, UserResponse
from app.services import project_service, place_service, activity_service, visibility_service
from app.models.enums import EntityAction, EntityType

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/", response_model=list[ProjectListResponse])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    projects = visibility_service.get_visible_projects(db, user)
    projects = sorted(projects, key=lambda p: p.updated_at, reverse=True)
    result = []
    for p in projects:
        progress = project_service.get_project_progress(db, user, p)
        result.append(ProjectListResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            visibility=p.visibility,
            creator_username=p.creator.username,
            total_places=progress["total_places"],
            visited_places=progress["visited_places"],
            progress_percent=progress["progress_percent"],
            is_completed=progress["is_completed"],
            created_at=p.created_at,
            updated_at=p.updated_at,
        ))
    return result


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = project_service.create_project(db, user, payload)
    activity_service.log_activity(db, user, EntityAction.CREATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not visibility_service.can_user_see_project(db, user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")
    return _project_to_response(db, user, project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    project = project_service.update_project(db, user, project, payload)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    activity_service.log_activity(db, user, EntityAction.DELETED, EntityType.PROJECT, project.id, project.name)
    project_service.delete_project(db, user, project)
    return None


@router.post("/{project_id}/places", response_model=ProjectResponse)
def add_place_to_project(
    project_id: int,
    place_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    place = db.query(Place).filter(Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar não encontrado")

    project_service.add_place_to_project(db, user, project, place)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


@router.delete("/{project_id}/places/{place_id}", response_model=ProjectResponse)
def remove_place_from_project(
    project_id: int,
    place_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    project_service.remove_place_from_project(db, user, project, place_id)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


def _to_search_result(p: Place) -> PlaceSearchResult:
    return PlaceSearchResult(
        osm_type=p.osm_type,
        osm_id=p.osm_id,
        name=p.name,
        place_type=p.place_type,
        hierarchy=p.hierarchy,
        lat=p.lat,
        lon=p.lon,
        is_cached=True,
    )


def _resolve_line(line: str, candidates: list[PlaceSearchResult]) -> BulkImportLine:
    """Decide resolved/ambiguous/not_found for one input line.

    A line is resolved when there is exactly one candidate, or exactly one
    candidate whose name matches the line exactly (case-insensitive).
    Otherwise the user picks in the review screen."""
    if not candidates:
        return BulkImportLine(line=line, status="not_found")

    exact = [c for c in candidates if c.name.strip().lower() == line.lower()]
    if len(exact) == 1:
        return BulkImportLine(line=line, status="resolved", candidates=[exact[0]], selected=exact[0])
    if len(candidates) == 1:
        return BulkImportLine(line=line, status="resolved", candidates=candidates, selected=candidates[0])
    # Exact matches first in the review list, then the rest by relevance
    ordered = exact + place_service.rank_results([c for c in candidates if c not in exact], line)
    return BulkImportLine(line=line, status="ambiguous", candidates=ordered)


@router.post("/{project_id}/bulk-import", response_model=BulkImportResponse)
async def bulk_import_places(
    project_id: int,
    payload: BulkImportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    lines = []
    for raw_line in payload.lines:
        line = raw_line.strip()
        if not line:
            continue

        # Exact name match in the local cache resolves without hitting OSM
        exact_query = db.query(Place).filter(func.lower(Place.name) == line.lower())
        if payload.place_type is not None:
            exact_query = exact_query.filter(Place.place_type == payload.place_type)
        exact_cached = exact_query.all()
        if len(exact_cached) == 1:
            result = _to_search_result(exact_cached[0])
            lines.append(BulkImportLine(line=line, status="resolved", candidates=[result], selected=result))
            continue

        cached_query = db.query(Place).filter(Place.name.ilike(f"%{line}%"))
        if payload.place_type is not None:
            cached_query = cached_query.filter(Place.place_type == payload.place_type)
        cached = [_to_search_result(p) for p in
                  cached_query.limit(5).all()
                  if p not in exact_cached]
        try:
            osm_results = await place_service.search_nominatim(line, limit=5)
        except Exception:
            osm_results = []

        # Merge, deduplicating by OSM identity (cache first)
        seen = set()
        candidates = []
        for r in cached + osm_results:
            key = (r.osm_type, r.osm_id)
            if key not in seen:
                seen.add(key)
                candidates.append(r)

        # A type hint restricts resolution to candidates of that type
        if payload.place_type is not None:
            candidates = [c for c in candidates if c.place_type == payload.place_type]

        lines.append(_resolve_line(line, candidates[:8]))

    return BulkImportResponse(lines=lines)


@router.post("/{project_id}/bulk-import/confirm", response_model=ProjectResponse)
async def confirm_bulk_import(
    project_id: int,
    lines: list[BulkImportLine],
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    # Any line with a selected candidate is imported, whatever its original
    # status (the user resolves ambiguous lines in the review screen).
    for line in lines:
        if line.selected:
            place = place_service.get_or_create_place(
                db,
                osm_type=line.selected.osm_type,
                osm_id=line.selected.osm_id,
                name=line.selected.name,
                place_type=line.selected.place_type,
                hierarchy=line.selected.hierarchy,
                lat=line.selected.lat,
                lon=line.selected.lon,
            )
            place = await place_service.ensure_place_polygon(db, place)
            project_service.add_place_to_project(db, user, project, place)

    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


@router.post("/{project_id}/places/{place_id}/unmark", response_model=ProjectResponse)
def toggle_place_unmarked(
    project_id: int,
    place_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project or not project_service.can_user_edit_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Projeto não encontrado")

    project_place = project_service.toggle_place_unmarked(db, user, project, place_id)
    if not project_place:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar não encontrado no projeto")
    return _project_to_response(db, user, project)


def _project_to_response(db: Session, user: User, project: Project) -> ProjectResponse:
    progress = project_service.get_project_progress(db, user, project)
    places = []
    for pp in project.places:
        is_visited = (not pp.is_unmarked) and project_service.is_place_visited_in_project(db, user, project.id, pp.place_id)
        places.append({
            "id": pp.id,
            "place_id": pp.place.id,
            "place_name": pp.place.name,
            "place_type": pp.place.place_type,
            "place_hierarchy": pp.place.hierarchy,
            "place_lat": pp.place.lat,
            "place_lon": pp.place.lon,
            "place_polygon": pp.place.polygon,
            "is_visited": is_visited,
            "is_unmarked": pp.is_unmarked,
            "visited_at": pp.added_at if is_visited else None,
        })

    trips = [
        TripListResponse(
            id=tp.trip.id,
            start_date=tp.trip.start_date,
            end_date=tp.trip.end_date,
            visibility=tp.trip.visibility,
            creator_username=tp.trip.creator.username,
            place_count=len(tp.trip.places),
            project_count=len(tp.trip.projects),
            created_at=tp.trip.created_at,
            updated_at=tp.trip.updated_at,
        )
        for tp in project.trips
        if visibility_service.can_user_see_trip(db, user, tp.trip)
    ]
    trips.sort(key=lambda t: t.updated_at, reverse=True)

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        visibility=project.visibility,
        map_mode=project.map_mode,
        creator_id=project.creator_id,
        creator_username=project.creator.username,
        participants=[UserResponse.model_validate(u) for u in project.participants],
        visible_users=[UserResponse.model_validate(u) for u in project.visible_users],
        places=places,
        trips=trips,
        total_places=progress["total_places"],
        visited_places=progress["visited_places"],
        progress_percent=progress["progress_percent"],
        is_completed=progress["is_completed"],
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
