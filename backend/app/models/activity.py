from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(
        Enum(
            "place_added_to_trip",
            "place_visited_in_project",
            "companion_joined",
            "collaborator_joined",
            name="activity_event_type",
            create_type=False,
        ),
        nullable=False,
    )
    entity_type: Mapped[str] = mapped_column(
        Enum("trip", "project", name="entity_type", create_type=False),
        nullable=False,
    )
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    entity_name: Mapped[str] = mapped_column(String(255), nullable=False)
    secondary_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    actor: Mapped["User"] = relationship("User", foreign_keys=[actor_id])
