"""Add missing indexes on FK columns in project tables

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_project_shared_users_user_id",
        "project_shared_users",
        ["user_id"],
        if_not_exists=True,
    )
    op.create_index(
        "ix_project_direct_visits_marked_by_user_id",
        "project_direct_visits",
        ["marked_by_user_id"],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index("ix_project_direct_visits_marked_by_user_id", table_name="project_direct_visits")
    op.drop_index("ix_project_shared_users_user_id", table_name="project_shared_users")
