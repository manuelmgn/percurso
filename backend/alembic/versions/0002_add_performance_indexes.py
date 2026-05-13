"""Add missing and composite indexes for common query patterns

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # trip_media_links.trip_id — no index at all; every _load_trip does a seq scan
    op.create_index("ix_trip_media_links_trip_id", "trip_media_links", ["trip_id"])

    # Composite indexes for ordered list queries:
    #   WHERE creator_id = X ORDER BY created_at DESC
    # The left-prefix covers the filter; the right column covers the sort.
    # The existing single-column ix_trips_creator_id / ix_projects_creator_id
    # remain valid for joins but the composite takes over for list queries.
    op.create_index("ix_trips_creator_id_created_at", "trips", ["creator_id", "created_at"])
    op.create_index("ix_projects_creator_id_created_at", "projects", ["creator_id", "created_at"])

    # Composite for notification feed: WHERE recipient_id = X ORDER BY created_at DESC LIMIT 50
    op.create_index(
        "ix_notifications_recipient_id_created_at",
        "notifications",
        ["recipient_id", "created_at"],
    )

    # user_id on the shared-user join tables — needed for the reverse lookup
    # (find all trips/projects shared with a given user)
    op.create_index("ix_trip_shared_users_user_id", "trip_shared_users", ["user_id"])
    op.create_index("ix_project_shared_users_user_id", "project_shared_users", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_project_shared_users_user_id", "project_shared_users")
    op.drop_index("ix_trip_shared_users_user_id", "trip_shared_users")
    op.drop_index("ix_notifications_recipient_id_created_at", "notifications")
    op.drop_index("ix_projects_creator_id_created_at", "projects")
    op.drop_index("ix_trips_creator_id_created_at", "trips")
    op.drop_index("ix_trip_media_links_trip_id", "trip_media_links")
