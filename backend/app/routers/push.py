from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, validate_csrf
from app.models import User, PushSubscription
from app.schemas import (
    PushSubscribeRequest,
    PushUnsubscribeRequest,
    VapidPublicKeyResponse,
)
from app.services import push_service

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
def vapid_public_key(user: User = Depends(get_current_user)):
    return {"public_key": push_service.vapid_public_key_b64url() or ""}


@router.post("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(
    payload: PushSubscribeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    # One owner per endpoint: re-subscribing from another account reassigns it.
    db.query(PushSubscription).filter(PushSubscription.endpoint == payload.endpoint).delete()
    db.add(
        PushSubscription(
            user_id=user.id,
            endpoint=payload.endpoint,
            keys=payload.keys,
        )
    )
    db.commit()


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    payload: PushUnsubscribeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(validate_csrf),
):
    db.query(PushSubscription).filter(
        PushSubscription.user_id == user.id,
        PushSubscription.endpoint == payload.endpoint,
    ).delete()
    db.commit()
