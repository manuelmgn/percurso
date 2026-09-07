from sqlalchemy import Column, Integer, ForeignKey, DateTime, Enum, UniqueConstraint
from datetime import datetime, timezone

from app.database import Base
from app.models.enums import EntityType


class Pin(Base):
    """A user's pinned trip or project, shown first on the dashboard."""

    __tablename__ = "pins"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type = Column(Enum(EntityType), nullable=False)
    entity_id = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "entity_type", "entity_id", name="uq_pins_user_entity"),
    )
