#!/bin/bash
set -e

if [ -z "${DATABASE_URL}" ]; then
    echo "ERROR: DATABASE_URL is not set. Add a PostgreSQL service in Railway and link it to this service." >&2
    exit 1
fi

echo "Running Alembic migrations..."
alembic upgrade head

echo "Starting application..."
exec "$@"
