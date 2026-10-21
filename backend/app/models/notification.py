from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, JSON

from app.database import Base


class Notification(Base):
    """An in-app notification for a user, e.g. a trip they participate in
    was created or edited by someone else."""

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    # trip_created | trip_updated | project_created | project_updated
    type = Column(String(50), nullable=False)
    entity_type = Column(String(20), nullable=False)
    entity_id = Column(Integer, nullable=False)
    # Denormalised for list display and push payloads.
    entity_name = Column(String(255), nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class PushSubscription(Base):
    """A Web Push subscription belonging to a user (one per browser)."""

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(String(2048), nullable=False, unique=True)
    # {"p256dh": ..., "auth": ...} as delivered by PushManager.subscribe().
    keys = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
