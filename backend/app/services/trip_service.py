from datetime import date, datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models import User, Trip, TripPlace, TripProject, Place, Project, Photo, EntityType
from app.sanitize import sanitize_notes
from app.schemas import TripCreate, TripUpdate, ExternalLinkInput
from app.services import visibility_service, project_service, notification_service, image_service, pin_service


def trip_display_name(trip: Trip) -> str:
    return trip.title or f"Viagem {trip.start_date} – {trip.end_date}"


def detect_external_link_type(url: str) -> str:
    """Classify an external link: Google Photos albums, Immich (default port
    2283 or an 'immich' hostname) or a generic link."""
    try:
        parsed = urlparse(url)
        port = parsed.port  # raises ValueError on malformed ports
    except ValueError:
        return "link"
    host = (parsed.hostname or "").lower()
    if host in ("photos.google.com", "photos.app.goo.gl"):
        return "google_photos"
    if port == 2283 or "immich" in host:
        return "immich"
    return "link"


def _link_dedup_key(url: str) -> str:
    """Two links are duplicates when scheme/host/port differ only in case
    and the path only in a trailing slash (paths stay case-sensitive)."""
    parsed = urlparse(url)
    try:
        port = parsed.port  # raises ValueError on malformed ports
    except ValueError:
        port = None
    key = f"{parsed.scheme.lower()}://{(parsed.hostname or '').lower()}"
    if port:
        key += f":{port}"
    key += parsed.path.rstrip("/")
    if parsed.query:
        key += f"?{parsed.query}"
    return key


def _normalise_external_links(links: list[ExternalLinkInput]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for link in links:
        url = link.url.strip()
        key = _link_dedup_key(url)
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ligações externas duplicadas",
            )
        seen.add(key)
        result.append({"url": url, "type": detect_external_link_type(url)})
    return result


def create_trip(db: Session, user: User, data: TripCreate) -> Trip:
    end_date = data.end_date or data.start_date

    trip = Trip(
        title=(data.title or "").strip() or None,
        start_date=data.start_date,
        end_date=end_date,
        notes=sanitize_notes(data.notes),
        visibility=data.visibility,
        creator_id=user.id,
        companions_text=data.companions_text,
        external_links=_normalise_external_links(data.external_links) or None,
    )
    db.add(trip)
    db.flush()

    _update_relations(db, user, trip, data)
    db.commit()
    db.refresh(trip)
    notification_service.notify_participants(
        db,
        user,
        notif_type="trip_created",
        entity_type="trip",
        entity_id=trip.id,
        entity_name=trip_display_name(trip),
        participant_ids=[p.id for p in trip.participants],
    )
    return trip


def update_trip(
    db: Session,
    user: User,
    trip: Trip,
    data: TripUpdate,
    auto_immich_cover: Optional[str] = None,
) -> Trip:
    # Validate the resulting pair, not just the payload: a PATCH carrying a
    # single date can otherwise leave start_date > end_date (the schema
    # validator only fires when both dates arrive together).
    new_start = data.start_date if data.start_date is not None else trip.start_date
    new_end = data.end_date if data.end_date is not None else trip.end_date
    if new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A data de fim não pode ser anterior à data de início",
        )

    if data.title is not None:
        trip.title = data.title.strip() or None
    if data.start_date is not None:
        trip.start_date = data.start_date
    if data.end_date is not None:
        trip.end_date = data.end_date or trip.start_date
    if data.notes is not None:
        trip.notes = sanitize_notes(data.notes)
    if data.visibility is not None:
        trip.visibility = data.visibility
    if data.companions_text is not None:
        trip.companions_text = data.companions_text
    if data.external_links is not None:
        trip.external_links = _normalise_external_links(data.external_links) or None

    if data.clear_cover:
        trip.cover_photo_id = None
        trip.cover_immich_asset_id = None
    elif data.cover_photo_id is not None:
        # Deliberate 404 (not 403/422) so ids of other trips' photos cannot
        # even be probed, matching the photos router.
        photo = (
            db.query(Photo)
            .filter(Photo.id == data.cover_photo_id, Photo.trip_id == trip.id)
            .first()
        )
        if not photo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fotografia não encontrada")
        trip.cover_photo_id = photo.id
        trip.cover_immich_asset_id = None
    elif data.cover_immich_asset_id is not None:
        trip.cover_immich_asset_id = data.cover_immich_asset_id
        trip.cover_photo_id = None
        if trip.immich_owner_id is None:
            trip.immich_owner_id = user.id

    if data.clear_immich_album:
        trip.immich_album_id = None
        trip.immich_owner_id = None
        # Do not leave a cover pointing at an unlinked Immich album.
        trip.cover_immich_asset_id = None
    elif data.immich_album_id is not None:
        album_changed = data.immich_album_id != trip.immich_album_id or trip.immich_owner_id != user.id
        trip.immich_album_id = data.immich_album_id
        trip.immich_owner_id = user.id
        explicit_cover = (
            data.clear_cover
            or data.cover_photo_id is not None
            or data.cover_immich_asset_id is not None
        )
        if not explicit_cover:
            if auto_immich_cover:
                trip.cover_immich_asset_id = auto_immich_cover
                trip.cover_photo_id = None
            elif album_changed:
                # Switched to an album with no detectable cover: drop any
                # Immich cover belonging to the previous album.
                trip.cover_immich_asset_id = None

    if (data.start_date is not None or data.end_date is not None) and _requested_stops(data) is None:
        _prune_visit_dates(trip)
    _update_relations(db, user, trip, data)
    trip.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(trip)
    notification_service.notify_participants(
        db,
        user,
        notif_type="trip_updated",
        entity_type="trip",
        entity_id=trip.id,
        entity_name=trip_display_name(trip),
        participant_ids=[p.id for p in trip.participants],
    )
    return trip


def _requested_stops(data) -> Optional[list[tuple[int, list[date]]]]:
    """Ordered (place_id, sorted unique visit dates) pairs from the payload,
    or None when it carries no place list. `stops` wins over the legacy
    `place_ids`; a place repeated in the list keeps its first position and
    merges the visit days of every occurrence."""
    if data.stops is not None:
        raw = [(s.place_id, s.visit_dates) for s in data.stops]
    elif data.place_ids is not None:
        raw = [(place_id, []) for place_id in data.place_ids]
    else:
        return None
    merged: dict[int, set[date]] = {}
    for place_id, visit_dates in raw:
        merged.setdefault(place_id, set()).update(visit_dates)
    return [(place_id, sorted(days)) for place_id, days in merged.items()]


def _check_visit_dates(trip: Trip, stops: list[tuple[int, list[date]]]) -> None:
    for _, visit_dates in stops:
        if any(d < trip.start_date or d > trip.end_date for d in visit_dates):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="As datas de visita dos lugares têm de estar dentro das datas da viagem",
            )


def _prune_visit_dates(trip: Trip) -> None:
    """Drop visit days left outside the trip range after its dates changed
    (only when the payload did not resend the stops)."""
    for trip_place in trip.places:
        if not trip_place.visit_dates:
            continue
        kept = [
            d for d in trip_place.visit_dates
            if trip.start_date.isoformat() <= d <= trip.end_date.isoformat()
        ]
        if kept != trip_place.visit_dates:
            trip_place.visit_dates = kept or None


def _update_relations(db: Session, user: User, trip: Trip, data) -> None:
    """Replace the trip's places/projects/participants/viewers by what the
    payload carries. Each block only runs when the ids key was sent (PATCH
    may omit them). Unknown place ids are skipped, matching the tolerant
    behaviour elsewhere; project ids must also be visible to the editor,
    otherwise linking a trip would leak a hidden project to every viewer of
    the trip. Participant ids resolve through orml."""
    stops = _requested_stops(data)
    if stops is not None:
        # Rebuild the whole list in the requested order. Validate all ids
        # in one IN query instead of one query per id.
        _check_visit_dates(trip, stops)
        db.query(TripPlace).filter(TripPlace.trip_id == trip.id).delete()
        requested_ids = {place_id for place_id, _ in stops}
        valid_place_ids = (
            {row[0] for row in db.query(Place.id).filter(Place.id.in_(requested_ids))}
            if requested_ids
            else set()
        )
        now = datetime.now(timezone.utc)
        position = 0
        for place_id, visit_dates in stops:
            if place_id not in valid_place_ids:
                continue
            db.add(
                TripPlace(
                    trip_id=trip.id,
                    place_id=place_id,
                    added_at=now,
                    position=position,
                    visit_dates=[d.isoformat() for d in visit_dates] or None,
                )
            )
            position += 1

    if data.project_ids is not None:
        db.query(TripProject).filter(TripProject.trip_id == trip.id).delete()
        valid_project_ids = (
            {
                row[0]
                for row in db.query(Project.id).filter(
                    Project.id.in_(set(data.project_ids)),
                    visibility_service._project_is_visible_condition(user.id),
                )
            }
            if data.project_ids
            else set()
        )
        for project_id in valid_project_ids:
            db.add(TripProject(trip_id=trip.id, project_id=project_id))

    visibility_service.apply_user_links(db, trip, data)


def delete_trip(db: Session, trip: Trip) -> None:
    """Deletes the trip and its photo rows; the photo files are removed from
    disk only after the transaction has committed (a failed commit must not
    leave rows pointing at deleted files)."""
    photos = db.query(Photo).filter(Photo.trip_id == trip.id).all()
    # Detach the cover first: with cover_photo_id still set, Trip and Photo
    # reference each other and the flush cannot order the deletes.
    trip.cover_photo_id = None
    db.flush()
    # The Photo relationship has no delete cascade, so the rows must be
    # removed explicitly; otherwise the ORM would nullify their
    # non-nullable trip_id and the delete would fail.
    for photo in photos:
        db.delete(photo)
    pin_service.delete_pins_for_entity(db, EntityType.TRIP, trip.id)
    db.delete(trip)
    db.commit()
    image_service.unlink_uploads(photo.url for photo in photos)


def get_affected_projects(db: Session, user: User, trip: Trip) -> list[Project]:
    projects = []
    for trip_project in trip.projects:
        project = trip_project.project
        if (
            project_service.can_user_edit_project(user, project)
            and visibility_service.can_user_see_project(db, user, project)
        ):
            projects.append(project)
    return projects


def can_user_edit_trip(user: User, trip: Trip) -> bool:
    return visibility_service.can_user_edit_entity(user, trip)


def list_trips(db: Session, user: User) -> list[Trip]:
    """Visible trips, most recently updated first (ordered in the DB)."""
    return visibility_service.get_visible_trips(db, user)


def get_trip_by_id(db: Session, trip_id: int) -> Optional[Trip]:
    return db.query(Trip).filter(Trip.id == trip_id).first()
