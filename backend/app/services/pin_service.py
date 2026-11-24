from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import User, Pin, EntityType, Trip, Project
from app.services import visibility_service

# Pinned items are capped per entity type; pinning a third one is rejected
# with a 409 so the user unpins one first (no silent replacement).
MAX_PINS_PER_TYPE = 2


def _prune_invisible_pins(db: Session, user: User, pins: list[Pin]) -> list[Pin]:
    """Drop pins whose target entity was deleted or whose visibility was
    narrowed so the user can no longer see it. Prevents information leaks and
    stops inaccessible pins from consuming the per-type cap."""
    if not pins:
        return []
    visible_trip_ids = (
        visibility_service.get_visible_trip_ids(db, user)
        if any(p.entity_type == EntityType.TRIP for p in pins)
        else set()
    )
    visible_project_ids = (
        visibility_service.get_visible_project_ids(db, user)
        if any(p.entity_type == EntityType.PROJECT for p in pins)
        else set()
    )
    kept: list[Pin] = []
    stale: list[Pin] = []
    for p in pins:
        if p.entity_type == EntityType.TRIP and p.entity_id in visible_trip_ids:
            kept.append(p)
        elif p.entity_type == EntityType.PROJECT and p.entity_id in visible_project_ids:
            kept.append(p)
        else:
            stale.append(p)
    if stale:
        for p in stale:
            db.delete(p)
        db.commit()
    return kept


def list_pins(db: Session, user: User) -> list[Pin]:
    pins = db.query(Pin).filter(Pin.user_id == user.id).order_by(Pin.created_at).all()
    return _prune_invisible_pins(db, user, pins)


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

    existing_same_type = (
        db.query(Pin)
        .filter(Pin.user_id == user.id, Pin.entity_type == entity_type)
        .all()
    )
    visible_same_type = _prune_invisible_pins(db, user, existing_same_type)
    if len(visible_same_type) >= MAX_PINS_PER_TYPE:
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


def delete_pins_for_entity(db: Session, entity_type: EntityType, entity_id: int) -> None:
    """Remove every pin pointing at an entity about to be deleted. Pins carry
    a plain entity id with no FK, so without this they would dangle on other
    users' dashboards."""
    db.query(Pin).filter(Pin.entity_type == entity_type, Pin.entity_id == entity_id).delete(
        synchronize_session=False
    )
