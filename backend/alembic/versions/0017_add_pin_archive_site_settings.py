"""Add is_pinned, is_archived, site_settings

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-17
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("projects", sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("projects", sa.Column("is_archived", sa.Boolean(), nullable=False, server_default="false"))

    op.create_table(
        "site_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "allow_public_profiles_without_auth",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )
    op.execute("INSERT INTO site_settings (id, allow_public_profiles_without_auth) VALUES (1, true)")


def downgrade() -> None:
    op.drop_table("site_settings")
    op.drop_column("projects", "is_archived")
    op.drop_column("projects", "is_pinned")
    op.drop_column("trips", "is_pinned")
