from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User
from app.schemas import (
    MarkNotificationsReadRequest,
    NotificationListResponse,
    UnreadCountResponse,
)
from app.services import notification_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/", response_model=NotificationListResponse)
def list_notifications(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return notification_service.list_notifications(db, user)


@router.get("/unread-count", response_model=UnreadCountResponse)
def unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return {"unread_count": notification_service.unread_count(db, user)}


@router.post("/read", response_model=UnreadCountResponse)
def mark_read(
    payload: MarkNotificationsReadRequest,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    unread = notification_service.mark_read(db, user, payload.ids)
    return {"unread_count": unread}
