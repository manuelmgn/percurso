"""add visited_places_sharing_token to users

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("visited_places_sharing_token", sa.String(64), nullable=True))
    op.create_index("ix_users_visited_places_sharing_token", "users", ["visited_places_sharing_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_visited_places_sharing_token", table_name="users")
    op.drop_column("users", "visited_places_sharing_token")
