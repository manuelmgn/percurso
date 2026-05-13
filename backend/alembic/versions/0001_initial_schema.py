"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-13
"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        DROP TYPE IF EXISTS visibility_level  CASCADE;
        DROP TYPE IF EXISTS user_role         CASCADE;
        DROP TYPE IF EXISTS osm_type          CASCADE;
        DROP TYPE IF EXISTS place_type        CASCADE;
        DROP TYPE IF EXISTS invite_status     CASCADE;
        DROP TYPE IF EXISTS notification_type CASCADE;
        DROP TYPE IF EXISTS entity_type       CASCADE;
    """)

    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    except Exception:
        pass

    # DO blocks are the idiomatic PostgreSQL way to create a type only if it
    # does not already exist. Every op.create_table column below uses
    # pg.ENUM(..., create_type=False) so the PostgreSQL dialect never attempts
    # a second CREATE TYPE.
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE visibility_level AS ENUM ('public', 'private', 'link', 'users');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE user_role AS ENUM ('admin', 'user');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE osm_type AS ENUM ('node', 'way', 'relation');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE place_type AS ENUM (
                'building', 'landmark', 'monument', 'parish', 'neighbourhood',
                'city', 'town', 'village', 'comarca', 'province', 'region', 'country'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'declined');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE notification_type AS ENUM (
                'trip_invite', 'project_invite', 'invite_accepted',
                'invite_declined', 'removed_from_trip', 'removed_from_project'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE entity_type AS ENUM ('trip', 'project');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(50), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("biography", sa.Text, nullable=True),
        sa.Column("website_url", sa.String(500), nullable=True),
        sa.Column("role", pg.ENUM("admin", "user", name="user_role", create_type=False), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("default_trip_visibility", pg.ENUM("public", "private", "link", "users", name="visibility_level", create_type=False), nullable=False, server_default="private"),
        sa.Column("default_project_visibility", pg.ENUM("public", "private", "link", "users", name="visibility_level", create_type=False), nullable=False, server_default="private"),
        sa.Column("visited_places_visibility", pg.ENUM("public", "private", "link", "users", name="visibility_level", create_type=False), nullable=False, server_default="private"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email", "users", ["email"])

    # Places
    op.create_table(
        "places",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("osm_id", sa.BigInteger, nullable=False),
        sa.Column("osm_type", pg.ENUM("node", "way", "relation", name="osm_type", create_type=False), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("name_pt", sa.String(500), nullable=True),
        sa.Column("name_en", sa.String(500), nullable=True),
        sa.Column("place_type", pg.ENUM(
            "building", "landmark", "monument", "parish", "neighbourhood",
            "city", "town", "village", "comarca", "province", "region", "country",
            name="place_type", create_type=False,
        ), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=True),
        sa.Column("region_name", sa.String(255), nullable=True),
        sa.Column("geometry", geoalchemy2.Geometry("GEOMETRY", srid=4326), nullable=True),
        sa.Column("centroid", geoalchemy2.Geometry("POINT", srid=4326), nullable=True),
        sa.Column("wikipedia_summary", sa.Text, nullable=True),
        sa.Column("wikipedia_language", sa.String(5), nullable=True),
        sa.Column("wikipedia_title", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_places_osm_id", "places", ["osm_id"])
    op.create_index("ix_places_country_code", "places", ["country_code"])

    # Trips
    op.create_table(
        "trips",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("creator_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("start_date", sa.Date, nullable=True),
        sa.Column("end_date", sa.Date, nullable=True),
        sa.Column("cover_image_url", sa.String(500), nullable=True),
        sa.Column("cover_image_generating", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("visibility", pg.ENUM("public", "private", "link", "users", name="visibility_level", create_type=False), nullable=False, server_default="private"),
        sa.Column("sharing_token", sa.String(64), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_trips_creator_id", "trips", ["creator_id"])
    op.create_index("ix_trips_sharing_token", "trips", ["sharing_token"])

    # Trip companions
    op.create_table(
        "trip_companions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("trip_id", sa.Integer, sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("invite_token", sa.String(64), nullable=False, unique=True),
        sa.Column("status", pg.ENUM("pending", "accepted", "declined", name="invite_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("hide_from_profile", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_trip_companions_trip_id", "trip_companions", ["trip_id"])
    op.create_index("ix_trip_companions_user_id", "trip_companions", ["user_id"])
    op.create_index("ix_trip_companions_invite_token", "trip_companions", ["invite_token"])

    # Trip places
    op.create_table(
        "trip_places",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("trip_id", sa.Integer, sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("place_id", sa.Integer, sa.ForeignKey("places.id"), nullable=False),
        sa.Column("visit_order", sa.Integer, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("ix_trip_places_trip_id", "trip_places", ["trip_id"])
    op.create_index("ix_trip_places_place_id", "trip_places", ["place_id"])

    # Trip media links
    op.create_table(
        "trip_media_links",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("trip_id", sa.Integer, sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("url", sa.String(2000), nullable=False),
        sa.Column("og_title", sa.String(500), nullable=True),
        sa.Column("og_description", sa.Text, nullable=True),
        sa.Column("og_image_url", sa.String(500), nullable=True),
        sa.Column("og_site_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Trip shared users
    op.create_table(
        "trip_shared_users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("trip_id", sa.Integer, sa.ForeignKey("trips.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_trip_shared_users_trip_id", "trip_shared_users", ["trip_id"])

    # Projects
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("creator_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("goal_description", sa.Text, nullable=True),
        sa.Column("cover_image_url", sa.String(500), nullable=True),
        sa.Column("cover_image_generating", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("visibility", pg.ENUM("public", "private", "link", "users", name="visibility_level", create_type=False), nullable=False, server_default="private"),
        sa.Column("sharing_token", sa.String(64), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_projects_creator_id", "projects", ["creator_id"])

    # Project collaborators
    op.create_table(
        "project_collaborators",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("invite_token", sa.String(64), nullable=False, unique=True),
        sa.Column("status", pg.ENUM("pending", "accepted", "declined", name="invite_status", create_type=False), nullable=False, server_default="pending"),
        sa.Column("hide_from_profile", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_collaborators_project_id", "project_collaborators", ["project_id"])
    op.create_index("ix_project_collaborators_user_id", "project_collaborators", ["user_id"])

    # Project target places
    op.create_table(
        "project_target_places",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("place_id", sa.Integer, sa.ForeignKey("places.id"), nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_target_places_project_id", "project_target_places", ["project_id"])
    op.create_index("ix_project_target_places_place_id", "project_target_places", ["place_id"])

    # Project shared users
    op.create_table(
        "project_shared_users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("project_id", sa.Integer, sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
    )
    op.create_index("ix_project_shared_users_project_id", "project_shared_users", ["project_id"])

    # Notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("recipient_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("notification_type", pg.ENUM(
            "trip_invite", "project_invite", "invite_accepted",
            "invite_declined", "removed_from_trip", "removed_from_project",
            name="notification_type", create_type=False,
        ), nullable=False),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("entity_type", pg.ENUM("trip", "project", name="entity_type", create_type=False), nullable=True),
        sa.Column("entity_id", sa.Integer, nullable=True),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("message", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_notifications_recipient_id", "notifications", ["recipient_id"])


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications")
    op.execute("DROP TABLE IF EXISTS project_shared_users")
    op.execute("DROP TABLE IF EXISTS project_target_places")
    op.execute("DROP TABLE IF EXISTS project_collaborators")
    op.execute("DROP TABLE IF EXISTS projects")
    op.execute("DROP TABLE IF EXISTS trip_shared_users")
    op.execute("DROP TABLE IF EXISTS trip_media_links")
    op.execute("DROP TABLE IF EXISTS trip_places")
    op.execute("DROP TABLE IF EXISTS trip_companions")
    op.execute("DROP TABLE IF EXISTS trips")
    op.execute("DROP TABLE IF EXISTS places")
    op.execute("DROP TABLE IF EXISTS users")

    op.execute("DROP TYPE IF EXISTS entity_type")
    op.execute("DROP TYPE IF EXISTS notification_type")
    op.execute("DROP TYPE IF EXISTS invite_status")
    op.execute("DROP TYPE IF EXISTS place_type")
    op.execute("DROP TYPE IF EXISTS osm_type")
    op.execute("DROP TYPE IF EXISTS user_role")
    op.execute("DROP TYPE IF EXISTS visibility_level")
