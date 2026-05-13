#!/bin/bash
set -e

if [ -z "${DATABASE_URL}" ]; then
    echo "ERROR: DATABASE_URL is not set. Add a PostgreSQL service in Railway and link it to this service." >&2
    exit 1
fi

# In production, orphaned enum types from failed migration attempts block re-runs.
# Drop all custom types before Alembic runs so the migration is always idempotent.
if [ "${ENVIRONMENT}" = "production" ]; then
    echo "Dropping orphaned enum types (if any)..."
    psql "${DATABASE_URL}" -q -c "
        DROP TYPE IF EXISTS visibility_level  CASCADE;
        DROP TYPE IF EXISTS user_role         CASCADE;
        DROP TYPE IF EXISTS osm_type          CASCADE;
        DROP TYPE IF EXISTS place_type        CASCADE;
        DROP TYPE IF EXISTS invite_status     CASCADE;
        DROP TYPE IF EXISTS notification_type CASCADE;
        DROP TYPE IF EXISTS entity_type       CASCADE;
    "
    echo "Pre-migration cleanup done."
fi

echo "Running Alembic migrations..."
alembic upgrade head

echo "Starting application..."
exec "$@"
