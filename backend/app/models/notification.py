from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    notification_type: Mapped[str] = mapped_column(
        Enum(
            "trip_invite",
            "project_invite",
            "invite_accepted",
            "invite_declined",
            "removed_from_trip",
            "removed_from_project",
            "cover_generation_failed",
            "added_to_trip_via_project",
            name="notification_type",
            create_type=False,
        ),
        nullable=False,
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Reference to the relevant entity
    entity_type: Mapped[str | None] = mapped_column(
        Enum("trip", "project", name="entity_type"), nullable=True
    )
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Human-readable message (pt-PT, stored at creation time)
    message: Mapped[str] = mapped_column(String(500), nullable=False)

    recipient: Mapped["User"] = relationship(
        "User",
        back_populates="notifications",
        foreign_keys="[Notification.recipient_id]",
    )
    actor: Mapped["User | None"] = relationship(
        "User",
        foreign_keys="[Notification.actor_id]",
    )
