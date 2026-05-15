#!/bin/sh
set -e

if [ -z "${DATABASE_URL}" ]; then
    echo "ERROR: DATABASE_URL is not set. Add a PostgreSQL service in Railway and link it to this service." >&2
    exit 1
fi

# Wait for the database to be ready before running migrations
echo "Waiting for database to be ready..."
MAX_RETRIES=30
RETRY=0
until python -c "
import asyncio, sys
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import get_settings
async def check():
    engine = create_async_engine(get_settings().database_url)
    try:
        async with engine.connect():
            pass
        await engine.dispose()
    except Exception as e:
        await engine.dispose()
        sys.exit(1)
asyncio.run(check())
" 2>/dev/null; do
    RETRY=$((RETRY + 1))
    if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
        echo "ERROR: Database not reachable after ${MAX_RETRIES} attempts. Giving up." >&2
        exit 1
    fi
    echo "Database not ready yet (attempt ${RETRY}/${MAX_RETRIES}). Retrying in 2s..."
    sleep 2
done
echo "Database is ready."

echo "Running Alembic migrations..."
alembic upgrade head

if [ "${FORCE_ADMIN_RESET}" = "true" ]; then
    echo "FORCE_ADMIN_RESET=true: resetting admin user..."
    python -m app.reset_admin
else
    echo "Provisioning admin user (if configured)..."
    python -m app.create_admin
fi

if [ -n "${CELERY_BROKER_URL}" ]; then
    CELERY_CMD="celery -A app.workers.celery_app worker --loglevel=info --concurrency=2"
    echo "Starting Celery worker: ${CELERY_CMD}"
    ${CELERY_CMD} &
    echo "Celery worker started (PID $!)"
else
    echo "WARNING: CELERY_BROKER_URL not set — Celery worker not started. AI cover generation will not work."
fi

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
