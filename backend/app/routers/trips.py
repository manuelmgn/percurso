from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, Trip
from app.models.enums import EntityAction, EntityType
from app.schemas import TripCreate, TripUpdate, TripResponse, TripListResponse, TripDeleteWarning, ProjectListResponse, UserResponse
from app.serializers import to_trip_list_responses, resolve_cover_photo_url
from app.services import trip_service, project_service, activity_service, visibility_service, immich_service
from app.services.trip_service import trip_display_name
from app.routers.guards import get_visible_trip_or_404, get_editable_trip_or_404

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.get("/", response_model=list[TripListResponse])
def list_trips(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trips = trip_service.list_trips(db, user)
    return to_trip_list_responses(db, user, trips)


@router.post("/", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    trip = trip_service.create_trip(db, user, payload)
    activity_service.log_activity(db, user, EntityAction.CREATED, EntityType.TRIP, trip.id, trip_display_name(trip))
    return _trip_to_response(db, user, trip)


@router.get("/{trip_id}", response_model=TripResponse)
def get_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = get_visible_trip_or_404(db, trip_id, user)
    return _trip_to_response(db, user, trip)


@router.patch("/{trip_id}", response_model=TripResponse)
async def update_trip(
    trip_id: int,
    payload: TripUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    trip = get_editable_trip_or_404(db, trip_id, user)

    auto_immich_cover: Optional[str] = None
    if payload.immich_album_id is not None and not payload.clear_immich_album:
        # Always verify the album is accessible to the caller's own Immich key
        # so users can only link their own albums (never someone else's).
        caller_key = immich_service.decrypt_api_key(user.immich_api_key)
        detected_cover = await immich_service.verify_album_and_get_thumbnail(
            caller_key, payload.immich_album_id
        )
        if (
            not payload.clear_cover
            and payload.cover_photo_id is None
            and payload.cover_immich_asset_id is None
        ):
            auto_immich_cover = detected_cover

    if payload.cover_immich_asset_id is not None and not payload.clear_cover:
        # Ensure the chosen cover asset actually belongs to the trip's linked
        # Immich album (prevents a co-editor from injecting an arbitrary asset
        # ID from the album owner's Immich library).
        if payload.clear_immich_album:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")
        if payload.immich_album_id is not None:
            check_album_id = payload.immich_album_id
            check_owner_id = user.id
            check_key = immich_service.decrypt_api_key(user.immich_api_key)
        else:
            check_album_id, check_owner_id, check_key, _ = immich_service.resolve_trip_immich_context(trip, user)
        if not check_album_id or check_owner_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")
        allowed_ids = await immich_service.get_album_asset_ids(check_owner_id, check_key, check_album_id)
        if payload.cover_immich_asset_id not in allowed_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")

    trip = trip_service.update_trip(db, user, trip, payload, auto_immich_cover=auto_immich_cover)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.TRIP, trip.id, trip_display_name(trip))
    return _trip_to_response(db, user, trip)


@router.get("/{trip_id}/delete-warning", response_model=TripDeleteWarning)
def get_delete_warning(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = get_editable_trip_or_404(db, trip_id, user)

    affected = trip_service.get_affected_projects(db, user, trip)
    return TripDeleteWarning(
        affected_projects=[
            ProjectListResponse(
                id=p.id,
                name=p.name,
                description=p.description,
                visibility=p.visibility,
                creator_username=p.creator.username,
                total_places=0,
                visited_places=0,
                progress_percent=0.0,
                is_completed=False,
                created_at=p.created_at,
                updated_at=p.updated_at,
            )
            for p in affected
        ]
    )


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    trip = get_editable_trip_or_404(db, trip_id, user)

    activity_service.log_activity(db, user, EntityAction.DELETED, EntityType.TRIP, trip.id, trip_display_name(trip))
    trip_service.delete_trip(db, trip)
    return None



def _trip_to_response(db: Session, user: User, trip: Trip) -> TripResponse:
    return TripResponse(
        id=trip.id,
        title=trip.title,
        start_date=trip.start_date,
        end_date=trip.end_date,
        notes=trip.notes,
        visibility=trip.visibility,
        companions_text=trip.companions_text,
        creator_id=trip.creator_id,
        creator_username=trip.creator.username,
        participants=[UserResponse.model_validate(u) for u in trip.participants],
        visible_users=[UserResponse.model_validate(u) for u in trip.visible_users],
        places=[
            {
                "id": tp.id,
                "place_id": tp.place.id,
                "place_name": tp.place.name,
                "place_type": tp.place.place_type,
                "place_hierarchy": tp.place.hierarchy,
                "place_lat": tp.place.lat,
                "place_lon": tp.place.lon,
            }
            for tp in trip.places
        ],
        projects=[
            {
                "id": tp.project.id,
                "name": tp.project.name,
                "description": tp.project.description,
                "visibility": tp.project.visibility,
                "creator_username": tp.project.creator.username,
                **project_service.get_project_progress(db, user, tp.project),
                "created_at": tp.project.created_at,
                "updated_at": tp.project.updated_at,
            }
            # A trip may be linked to a project the requester cannot see
            # (the link predates an edit, or visibility was narrowed later);
            # hide those rows instead of leaking them.
            for tp in trip.projects
            if visibility_service.can_user_see_project(db, user, tp.project)
        ],
        cover_photo_id=trip.cover_photo_id,
        cover_immich_asset_id=trip.cover_immich_asset_id,
        cover_photo_url=resolve_cover_photo_url(trip),
        immich_album_id=trip.immich_album_id,
        external_links=trip.external_links or [],
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )
