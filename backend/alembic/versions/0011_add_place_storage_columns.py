"""Add centroid floats, osm_class, addresstype, display_name, geometry_geojson to places

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("places", sa.Column("centroid_lat", sa.Float(), nullable=True))
    op.add_column("places", sa.Column("centroid_lng", sa.Float(), nullable=True))
    op.add_column("places", sa.Column("osm_class", sa.String(50), nullable=True))
    op.add_column("places", sa.Column("addresstype", sa.String(50), nullable=True))
    op.add_column("places", sa.Column("display_name", sa.String(1000), nullable=True))
    op.add_column("places", sa.Column("geometry_geojson", pg.JSONB(), nullable=True))

    # Backfill float coordinates from existing PostGIS centroid geometry
    op.execute("""
        UPDATE places
        SET centroid_lat = ST_Y(centroid::geometry),
            centroid_lng = ST_X(centroid::geometry)
        WHERE centroid IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column("places", "geometry_geojson")
    op.drop_column("places", "display_name")
    op.drop_column("places", "addresstype")
    op.drop_column("places", "osm_class")
    op.drop_column("places", "centroid_lng")
    op.drop_column("places", "centroid_lat")
