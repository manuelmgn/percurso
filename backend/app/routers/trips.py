from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, Trip
from app.schemas import TripCreate, TripUpdate, TripResponse, TripListResponse, TripDeleteWarning, ProjectListResponse
from app.serializers import to_trip_list_response
from app.services import trip_service, project_service, activity_service, visibility_service
from app.services.trip_service import trip_display_name
from app.models.enums import EntityAction, EntityType

router = APIRouter(prefix="/api/trips", tags=["trips"])


def _get_visible_trip(db: Session, trip_id: int, user: User) -> Trip:
    trip = trip_service.get_trip_by_id(db, trip_id)
    if not trip or not visibility_service.can_user_see_trip(db, user, trip):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viagem não encontrada")
    return trip


def _get_editable_trip(db: Session, trip_id: int, user: User) -> Trip:
    trip = trip_service.get_trip_by_id(db, trip_id)
    if not trip or not trip_service.can_user_edit_trip(user, trip):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viagem não encontrada")
    return trip


@router.get("/", response_model=list[TripListResponse])
def list_trips(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trips = trip_service.list_trips(db, user)
    return [to_trip_list_response(t) for t in trips]


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
    trip = _get_visible_trip(db, trip_id, user)
    return _trip_to_response(db, user, trip)


@router.patch("/{trip_id}", response_model=TripResponse)
def update_trip(
    trip_id: int,
    payload: TripUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    trip = _get_editable_trip(db, trip_id, user)

    trip = trip_service.update_trip(db, user, trip, payload)
    activity_service.log_activity(db, user, EntityAction.UPDATED, EntityType.TRIP, trip.id, trip_display_name(trip))
    return _trip_to_response(db, user, trip)


@router.get("/{trip_id}/delete-warning", response_model=TripDeleteWarning)
def get_delete_warning(
    trip_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    trip = _get_editable_trip(db, trip_id, user)

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
    trip = _get_editable_trip(db, trip_id, user)

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
            for tp in trip.projects
        ],
        created_at=trip.created_at,
        updated_at=trip.updated_at,
    )
