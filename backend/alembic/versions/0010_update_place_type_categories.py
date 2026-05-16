"""Remap place_type values to new granular category system

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-16
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The 0009 migration left values from the old 11-type set.
    # Only 'igreja' changed name (→ 'templo'); the rest are valid in the new system.
    op.execute("UPDATE places SET place_type = 'templo' WHERE place_type = 'igreja'")


def downgrade() -> None:
    op.execute("UPDATE places SET place_type = 'igreja' WHERE place_type = 'templo'")
