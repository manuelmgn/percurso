"""Add trip_projects and project_direct_visits tables; add added_to_trip_via_project notification type

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trip_projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trip_id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_id", "project_id"),
    )
    op.create_index("ix_trip_projects_trip_id", "trip_projects", ["trip_id"])
    op.create_index("ix_trip_projects_project_id", "trip_projects", ["project_id"])

    op.create_table(
        "project_direct_visits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("place_id", sa.Integer(), nullable=False),
        sa.Column("marked_by_user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["marked_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "place_id"),
    )
    op.create_index("ix_project_direct_visits_project_id", "project_direct_visits", ["project_id"])

    # Add new notification type (idempotent in PG >= 9.3)
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'added_to_trip_via_project'")


def downgrade() -> None:
    op.drop_index("ix_project_direct_visits_project_id", table_name="project_direct_visits")
    op.drop_table("project_direct_visits")
    op.drop_index("ix_trip_projects_project_id", table_name="trip_projects")
    op.drop_index("ix_trip_projects_trip_id", table_name="trip_projects")
    op.drop_table("trip_projects")
    # Note: removing ENUM values is not supported in PostgreSQL without full type recreation
