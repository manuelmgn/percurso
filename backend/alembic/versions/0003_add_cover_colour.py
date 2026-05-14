"""Add cover_colour to trips and projects

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PALETTE = [
    "#7C3AED", "#6D28D9", "#4F46E5", "#0369A1", "#0891B2",
    "#0D9488", "#059669", "#65A30D", "#B45309", "#C2410C",
    "#BE185D", "#7E22CE",
]


def upgrade() -> None:
    op.add_column("trips", sa.Column("cover_colour", sa.String(7), nullable=True))
    op.add_column("projects", sa.Column("cover_colour", sa.String(7), nullable=True))

    # Backfill existing rows with a deterministic colour derived from id
    cases = " ".join(
        f"WHEN (id % {len(_PALETTE)}) = {i} THEN '{colour}'"
        for i, colour in enumerate(_PALETTE)
    )
    op.execute(f"UPDATE trips   SET cover_colour = CASE {cases} END WHERE cover_colour IS NULL")
    op.execute(f"UPDATE projects SET cover_colour = CASE {cases} END WHERE cover_colour IS NULL")


def downgrade() -> None:
    op.drop_column("projects", "cover_colour")
    op.drop_column("trips", "cover_colour")
