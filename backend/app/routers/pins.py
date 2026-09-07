from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, EntityType
from app.schemas import PinCreate, PinResponse
from app.services import pin_service

router = APIRouter(prefix="/api/pins", tags=["pins"])


@router.get("/", response_model=list[PinResponse])
def list_pins(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return pin_service.list_pins(db, user)


@router.post("/", response_model=PinResponse, status_code=status.HTTP_201_CREATED)
def pin(
    payload: PinCreate,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    return pin_service.pin(db, user, payload.entity_type, payload.entity_id)


@router.delete("/{entity_type}/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def unpin(
    entity_type: EntityType,
    entity_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    pin_service.unpin(db, user, entity_type, entity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
