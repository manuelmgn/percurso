"""Add cover_image_delete_url to trips and projects

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-14
"""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("cover_image_delete_url", sa.String(500), nullable=True))
    op.add_column("projects", sa.Column("cover_image_delete_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "cover_image_delete_url")
    op.drop_column("projects", "cover_image_delete_url")
