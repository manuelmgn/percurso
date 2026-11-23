from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, Project, Place, Trip, TripProject
from app.schemas import (
    MAX_BULK_IMPORT_LINES,
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    BulkImportRequest,
    BulkImportResponse,
    BulkImportLine,
    PlaceSearchResult,
    UserResponse,
)
from app.serializers import to_search_result, to_trip_list_response, to_project_list_responses
from app.services import project_service, place_service, activity_service, visibility_service
from app.models.enums import EntityAction, EntityType
from app.routers.guards import get_visible_project_or_404, get_editable_project_or_404

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("/", response_model=list[ProjectListResponse])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    projects = visibility_service.get_visible_projects(db, user)
    return to_project_list_responses(db, user, projects)


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
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
    project = get_visible_project_or_404(db, project_id, user)
    return _project_to_response(db, user, project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = get_editable_project_or_404(db, project_id, user)

    project = project_service.update_project(db, user, project, payload)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = get_editable_project_or_404(db, project_id, user)

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
    project = get_editable_project_or_404(db, project_id, user)

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
    project = get_editable_project_or_404(db, project_id, user)

    project_service.remove_place_from_project(db, user, project, place_id)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    return _project_to_response(db, user, project)


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
    project = get_editable_project_or_404(db, project_id, user)

    place_type = payload.place_type

    lines: list[BulkImportLine] = []
    # Reuse resolutions for duplicate lines within the same payload so repeated
    # entries never burn extra Nominatim requests.
    seen_queries: dict[str, BulkImportLine] = {}
    for raw_line in payload.lines:
        line = raw_line.strip()
        if not line:
            continue

        norm_key = line.lower()
        if norm_key in seen_queries:
            lines.append(seen_queries[norm_key].model_copy(update={"line": line}, deep=True))
            continue

        # Exact name match in the local cache resolves without hitting OSM —
        # even if OSM would return same-named duplicates that would make the
        # line ambiguous later.
        exact_query = db.query(Place).filter(func.lower(Place.name) == norm_key)
        if place_type is not None:
            exact_query = exact_query.filter(Place.place_type == place_type)
        exact_cached = exact_query.all()

        if len(exact_cached) == 1:
            result = to_search_result(exact_cached[0])
            resolved_line = BulkImportLine(line=line, status="resolved", candidates=[result], selected=result)
            seen_queries[norm_key] = resolved_line
            lines.append(resolved_line)
            continue

        cached_results = [to_search_result(p) for p in exact_cached]
        cached_results += [
            to_search_result(p)
            for p in place_service.find_cached_places(db, line, limit=5)
            if p not in exact_cached
        ]
        if place_type is not None:
            cached_results = [c for c in cached_results if c.place_type == place_type]

        try:
            osm_results = await place_service.search_nominatim(line, limit=5)
        except Exception:
            # When nothing matched locally, swallowing an upstream outage after
            # all retries would mislabel valid places as "not_found". Fail the
            # batch with 503 instead so the client can pause and retry safely.
            if not cached_results:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="O serviço de geocodificação (OpenStreetMap) está temporariamente indisponível — tenta novamente dentro de instantes.",
                )
            osm_results = []
        if place_type is not None:
            # A type hint restricts resolution to candidates of that type
            osm_results = [c for c in osm_results if c.place_type == place_type]

        # Merge, deduplicating by OSM identity (cache first), then resolve
        candidates = place_service.merge_dedup_rank(cached_results + osm_results, limit=8)
        resolved_line = _resolve_line(line, candidates)
        seen_queries[norm_key] = resolved_line
        lines.append(resolved_line)

    return BulkImportResponse(lines=lines)


@router.post("/{project_id}/bulk-import/confirm", response_model=ProjectResponse)
async def confirm_bulk_import(
    project_id: int,
    lines: list[BulkImportLine] = Body(..., max_length=MAX_BULK_IMPORT_LINES),
    log_activity: bool = Query(True),
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = get_editable_project_or_404(db, project_id, user)

    # Persist all places and project links first so no place is ever lost if a
    # later boundary-polygon lookup fails; fetch missing polygons afterwards in
    # Nominatim /lookup batches.
    imported_places: list[Place] = []
    for line in lines:
        if line.selected:
            place, _ = place_service.get_or_create_place(
                db,
                osm_type=line.selected.osm_type,
                osm_id=line.selected.osm_id,
                name=line.selected.name,
                place_type=line.selected.place_type,
                hierarchy=line.selected.hierarchy,
                lat=line.selected.lat,
                lon=line.selected.lon,
            )
            project_service.add_place_to_project(db, user, project, place)
            imported_places.append(place)

    await place_service.ensure_places_polygons(db, imported_places)

    if log_activity:
        activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.PROJECT, project.id, project.name)
    db.refresh(project)
    return _project_to_response(db, user, project)


@router.post("/{project_id}/places/{place_id}/unmark", response_model=ProjectResponse)
def toggle_place_unmarked(
    project_id: int,
    place_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    project = get_editable_project_or_404(db, project_id, user)

    project_place = project_service.toggle_place_unmarked(db, user, project, place_id)
    if not project_place:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lugar não encontrado no projeto")
    return _project_to_response(db, user, project)


def _project_to_response(db: Session, user: User, project: Project) -> ProjectResponse:
    # Resolve visited places once for the whole response (progress + per-place
    # flags) instead of one existence check per place. Last visit dates come
    # from one aggregate query (real trip dates, not the date the place was
    # added to the project).
    visited_ids = project_service.get_visited_place_ids_in_project(db, user, project.id)
    last_visits = project_service.get_last_visit_dates_in_project(db, user, project.id)
    progress = project_service.get_project_progress(db, user, project, visited_ids)
    places = []
    for pp in project.places:
        is_visited = (not pp.is_unmarked) and pp.place_id in visited_ids
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
            "visited_at": last_visits.get(pp.place_id) if is_visited else None,
        })

    # Visible linked trips in one eager query (same SQL visibility rule as
    # the trip list) instead of a per-trip lazy load + visibility check.
    trips = (
        db.query(Trip)
        .options(*visibility_service._trip_list_options())
        .filter(
            TripProject.project_id == project.id,
            TripProject.trip_id == Trip.id,
            visibility_service._trip_is_visible_condition(user.id),
        )
        .all()
    )
    trips = [to_trip_list_response(t) for t in sorted(trips, key=lambda t: t.updated_at, reverse=True)]

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
