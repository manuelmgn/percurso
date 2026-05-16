"""Replace place_type enum with varchar and new category system

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-16
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add a temporary varchar column alongside the existing enum column.
    op.add_column("places", sa.Column("place_type_new", sa.String(50), nullable=True))

    # Map old enum values to new category strings.
    op.execute("""
        UPDATE places SET place_type_new = CASE place_type::text
            WHEN 'building'      THEN 'edificio'
            WHEN 'landmark'      THEN 'outro'
            WHEN 'monument'      THEN 'monumento'
            WHEN 'parish'        THEN 'bairro'
            WHEN 'neighbourhood' THEN 'bairro'
            WHEN 'city'          THEN 'cidade'
            WHEN 'town'          THEN 'cidade'
            WHEN 'village'       THEN 'cidade'
            WHEN 'comarca'       THEN 'comarca'
            WHEN 'province'      THEN 'provincia'
            WHEN 'region'        THEN 'regiao'
            WHEN 'country'       THEN 'pais'
            ELSE 'outro'
        END
    """)

    # Ensure no NULLs before making the column NOT NULL.
    op.execute("UPDATE places SET place_type_new = 'outro' WHERE place_type_new IS NULL")
    op.alter_column("places", "place_type_new", nullable=False)

    # Drop the old enum column and its backing PostgreSQL type.
    op.drop_column("places", "place_type")
    op.execute("DROP TYPE IF EXISTS place_type")

    # Rename the new column into place.
    op.alter_column("places", "place_type_new", new_column_name="place_type")


def downgrade() -> None:
    # Recreate the original enum type.
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE place_type AS ENUM (
                'building', 'landmark', 'monument', 'parish', 'neighbourhood',
                'city', 'town', 'village', 'comarca', 'province', 'region', 'country'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    op.add_column("places", sa.Column("place_type_old", sa.String(50), nullable=True))

    # Reverse-map new values back to old enum values (best-effort).
    op.execute("""
        UPDATE places SET place_type_old = CASE place_type
            WHEN 'edificio'  THEN 'building'
            WHEN 'monumento' THEN 'monument'
            WHEN 'bairro'    THEN 'neighbourhood'
            WHEN 'cidade'    THEN 'city'
            WHEN 'comarca'   THEN 'comarca'
            WHEN 'provincia' THEN 'province'
            WHEN 'regiao'    THEN 'region'
            WHEN 'pais'      THEN 'country'
            ELSE 'landmark'
        END
    """)

    op.drop_column("places", "place_type")

    op.execute("""
        ALTER TABLE places
            ADD COLUMN place_type place_type NOT NULL DEFAULT 'landmark'
    """)
    op.execute("""
        UPDATE places SET place_type = place_type_old::place_type
        WHERE place_type_old IS NOT NULL
    """)
    op.drop_column("places", "place_type_old")
