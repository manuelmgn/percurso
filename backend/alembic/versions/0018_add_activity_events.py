"""Add activity_events table

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE activity_event_type AS ENUM (
                'place_added_to_trip',
                'place_visited_in_project',
                'companion_joined',
                'collaborator_joined'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.create_table(
        "activity_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum(
                "place_added_to_trip",
                "place_visited_in_project",
                "companion_joined",
                "collaborator_joined",
                name="activity_event_type",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column(
            "entity_type",
            sa.Enum("trip", "project", name="entity_type", create_type=False),
            nullable=False,
        ),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("entity_name", sa.String(255), nullable=False),
        sa.Column("secondary_name", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_events_actor_id", "activity_events", ["actor_id"])
    op.create_index("ix_activity_events_entity_id", "activity_events", ["entity_id"])
    op.create_index("ix_activity_events_created_at", "activity_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_activity_events_created_at", "activity_events")
    op.drop_index("ix_activity_events_entity_id", "activity_events")
    op.drop_index("ix_activity_events_actor_id", "activity_events")
    op.drop_table("activity_events")
    op.execute("DROP TYPE IF EXISTS activity_event_type")
