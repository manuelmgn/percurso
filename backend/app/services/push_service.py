import base64
import json
import logging

from py_vapid import Vapid
from pywebpush import webpush, WebPushException
from sqlalchemy.orm import Session

from app.config import settings
from app.models import PushSubscription, User

logger = logging.getLogger(__name__)


def _load_vapid() -> Vapid | None:
    """Build a Vapid instance from the configured PEM, or None if not configured."""
    pem = settings.vapid_private_key
    if not pem:
        return None
    try:
        return Vapid.from_pem(pem.encode())
    except Exception:
        logger.exception("Invalid PERCURSOS_VAPID_PRIVATE_KEY")
        return None


def vapid_public_key_b64url() -> str | None:
    """Public key as base64url (no padding), the format PushManager expects."""
    pem = settings.vapid_public_key
    if not pem:
        return None
    try:
        from cryptography.hazmat.primitives.serialization import (
            Encoding,
            PublicFormat,
            load_pem_public_key,
        )

        key = load_pem_public_key(pem.encode())
        raw = key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    except Exception:
        logger.exception("Invalid PERCURSOS_VAPID_PUBLIC_KEY")
        return None


def send_to_user(db: Session, user: User, payload: dict) -> None:
    """Send a push notification to every subscription of the user.

    Subscriptions rejected by the push service (404/410) are removed.
    No-op when VAPID keys are not configured.
    """
    vapid = _load_vapid()
    if vapid is None:
        return

    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    stale_ids = []
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": sub.keys},
                data=json.dumps(payload),
                vapid_private_key=vapid,
                vapid_claims={"sub": settings.vapid_subject},
                ttl=24 * 60 * 60,
            )
        except WebPushException as exc:
            status = exc.response.status_code if exc.response is not None else None
            if status in (404, 410):
                stale_ids.append(sub.id)
            else:
                logger.warning("Push failed for user %s: %s", user.id, exc)
        except Exception:
            logger.exception("Unexpected push error for user %s", user.id)

    if stale_ids:
        db.query(PushSubscription).filter(PushSubscription.id.in_(stale_ids)).delete(
            synchronize_session=False
        )
        db.commit()
