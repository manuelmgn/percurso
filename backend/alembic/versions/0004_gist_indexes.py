"""Add PostGIS GIST spatial indexes on places geometry and centroid columns

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_places_geometry ON places USING GIST (geometry)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_places_centroid ON places USING GIST (centroid)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_places_geometry")
    op.execute("DROP INDEX IF EXISTS ix_places_centroid")
