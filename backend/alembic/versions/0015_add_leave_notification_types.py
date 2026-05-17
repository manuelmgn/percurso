"""Add companion_left and collaborator_left to notification_type enum

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-17
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'companion_left'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'collaborator_left'")


def downgrade() -> None:
    # PostgreSQL does not support removing enum values; downgrade is a no-op
    pass
