from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import settings
from app.database import engine, Base, db_session
from app.services import user_service
from app.routers import auth, me, users, places, projects, trips, activities, images, tiles, search, stats, admin, milestones, pins, notifications, push

# Import all models so they are registered with SQLAlchemy before create_all
from app.models import User, Session, Place, Project, ProjectPlace, Trip, TripPlace, TripProject, Activity, Milestone, Pin, Notification, PushSubscription  # noqa: F401


def _apply_lightweight_migrations():
    """Add columns introduced after the schema was first created.

    The project uses create_all instead of Alembic, so existing databases
    need new columns added by hand. Keep each migration idempotent."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    with engine.begin() as conn:
        if "project_places" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("project_places")]
            if "is_unmarked" not in columns:
                conn.execute(text("ALTER TABLE project_places ADD COLUMN is_unmarked BOOLEAN NOT NULL DEFAULT 0"))
        if "trips" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("trips")]
            if "title" not in columns:
                conn.execute(text("ALTER TABLE trips ADD COLUMN title VARCHAR(255)"))
        if "users" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("users")]
            if "theme" not in columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN theme VARCHAR(6) NOT NULL DEFAULT 'system'"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _apply_lightweight_migrations()
    with db_session() as db:
        user_service.seed_default_admin(db)
    yield


app = FastAPI(
    title="Percursos",
    description="Private travel and places tracker",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(me.router)
app.include_router(users.router)
app.include_router(places.router)
app.include_router(projects.router)
app.include_router(trips.router)
app.include_router(activities.router)
app.include_router(images.router)
app.include_router(tiles.router)
app.include_router(search.router)
app.include_router(stats.router)
app.include_router(milestones.router)
app.include_router(admin.router)
app.include_router(pins.router)
app.include_router(notifications.router)
app.include_router(push.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Serve uploaded files with long-lived cache headers (filenames are UUIDs, so
# immutable is safe) and tile cache directly.
@app.api_route("/uploads/{filename}", methods=["GET", "HEAD"])
def serve_upload(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=404, detail="Not found")
    file_path = settings.uploads_dir / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(file_path, headers={"Cache-Control": "public, max-age=31536000, immutable"})


app.mount("/tile-cache", StaticFiles(directory=settings.tile_cache_dir), name="tile-cache")


# Serve the React SPA for all non-API routes
if settings.frontend_dist.exists():
    app.mount("/assets", StaticFiles(directory=settings.frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_spa(full_path: str, request: Request):
        if full_path.startswith("api/") or full_path.startswith("uploads/") or full_path.startswith("tile-cache/"):
            raise HTTPException(status_code=404, detail="Not found")

        # Serve static files from frontend/dist if they exist (e.g. fonts, icons, favicon.ico)
        if full_path:
            target_file = (settings.frontend_dist / full_path).resolve()
            try:
                if target_file.is_file() and target_file.is_relative_to(settings.frontend_dist.resolve()):
                    return FileResponse(target_file)
            except (ValueError, OSError):
                pass

        index_file = settings.frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend not built")
