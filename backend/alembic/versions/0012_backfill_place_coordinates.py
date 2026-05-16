"""Ensure centroid_lat/centroid_lng are filled for all places that have a PostGIS centroid

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-16
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safe re-run of the backfill — only updates rows that are still missing values.
    op.execute("""
        UPDATE places
        SET centroid_lat = ST_Y(centroid::geometry),
            centroid_lng = ST_X(centroid::geometry)
        WHERE centroid IS NOT NULL
          AND (centroid_lat IS NULL OR centroid_lng IS NULL)
    """)


def downgrade() -> None:
    pass
