from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User, Pin, EntityType, Trip, Project
from app.services import visibility_service

# Pinned items are capped per entity type; pinning a third one is rejected
# with a 409 so the user unpins one first (no silent replacement).
MAX_PINS_PER_TYPE = 2


def list_pins(db: Session, user: User) -> list[Pin]:
    return db.query(Pin).filter(Pin.user_id == user.id).order_by(Pin.created_at).all()


def _get_visible_entity(db: Session, user: User, entity_type: EntityType, entity_id: int):
    """Return the trip/project if it exists and the user can see it, else None."""
    if entity_type == EntityType.TRIP:
        trip = db.query(Trip).filter(Trip.id == entity_id).first()
        if trip and visibility_service.can_user_see_trip(db, user, trip):
            return trip
    elif entity_type == EntityType.PROJECT:
        project = db.query(Project).filter(Project.id == entity_id).first()
        if project and visibility_service.can_user_see_project(db, user, project):
            return project
    return None


def pin(db: Session, user: User, entity_type: EntityType, entity_id: int) -> Pin:
    if entity_type not in (EntityType.TRIP, EntityType.PROJECT):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Tipo de entidade inválido")

    if _get_visible_entity(db, user, entity_type, entity_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Elemento não encontrado")

    existing = (
        db.query(Pin)
        .filter(Pin.user_id == user.id, Pin.entity_type == entity_type, Pin.entity_id == entity_id)
        .first()
    )
    if existing:
        return existing

    count = db.query(Pin).filter(Pin.user_id == user.id, Pin.entity_type == entity_type).count()
    if count >= MAX_PINS_PER_TYPE:
        label = "viagens" if entity_type == EntityType.TRIP else "projetos"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Só podes fixar {MAX_PINS_PER_TYPE} {label}. Desfixa um primeiro.",
        )

    new_pin = Pin(user_id=user.id, entity_type=entity_type, entity_id=entity_id)
    db.add(new_pin)
    db.commit()
    db.refresh(new_pin)
    return new_pin


def unpin(db: Session, user: User, entity_type: EntityType, entity_id: int) -> None:
    pin_row = (
        db.query(Pin)
        .filter(Pin.user_id == user.id, Pin.entity_type == entity_type, Pin.entity_id == entity_id)
        .first()
    )
    if pin_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Elemento não fixado")
    db.delete(pin_row)
    db.commit()
