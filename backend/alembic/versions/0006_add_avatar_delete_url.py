"""add avatar_delete_url to users

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_delete_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_delete_url")
