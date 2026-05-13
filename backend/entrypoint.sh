#!/bin/sh
set -e

if [ -z "${DATABASE_URL}" ]; then
    echo "ERROR: DATABASE_URL is not set. Add a PostgreSQL service in Railway and link it to this service." >&2
    exit 1
fi

echo "Running Alembic migrations..."
alembic upgrade head

if [ "${FORCE_ADMIN_RESET}" = "true" ]; then
    echo "FORCE_ADMIN_RESET=true: resetting admin user..."
    python -m app.reset_admin
else
    echo "Provisioning admin user (if configured)..."
    python -m app.create_admin
fi

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
