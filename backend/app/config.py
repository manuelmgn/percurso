from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo-root .env holds local development overrides (never committed; the Docker
# image does not include it). Real environment variables take precedence over
# values from the .env file.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="PERCURSOS_",
        env_file=_REPO_ROOT / ".env",
        env_file_encoding="utf-8",
    )

    env: str = "development"
    secret_key: str = "dev-secret-key-change-in-production"
    # Production hook: full database URL of the external database (e.g. a
    # future PostgreSQL). Left unset in local development, where the app uses
    # the SQLite file below, created automatically if it does not exist.
    database_url_override: str | None = None
    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    uploads_dir: Path = Path(__file__).resolve().parent.parent / "uploads"
    tile_cache_dir: Path = Path(__file__).resolve().parent.parent / "tile-cache"
    backups_dir: Path = Path(__file__).resolve().parent.parent / "backups"
    backup_retention_days: int = 30
    session_cookie_name: str = "session"
    session_max_age_days: int = 30
    # Set to True when serving over HTTPS so the session cookie is only sent
    # over encrypted connections.
    session_cookie_secure: bool = False
    # Maximum accepted size for an uploaded image (avatar, notes, etc.).
    max_upload_bytes: int = 15 * 1024 * 1024
    # Seeded automatically on first launch when the database has no users
    default_admin_username: str = "admin"
    default_admin_password: str = "pass"
    # Web Push (VAPID) keys in PEM format; when empty, push sending is
    # silently disabled and only in-app notifications are used.
    vapid_private_key: str | None = None
    vapid_public_key: str | None = None
    vapid_subject: str = "mailto:admin@percurso.local"

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        # Local development: SQLite file inside data_dir. The directory is
        # created on import (see database.py) and SQLite creates the file
        # itself on the first connection, so a fresh checkout needs no setup.
        return f"sqlite:///{self.data_dir / 'percursos.db'}"

    @property
    def frontend_dist(self) -> Path:
        # Docker layout: /app/frontend/dist; local dev layout: <repo>/frontend/dist
        docker_path = Path(__file__).resolve().parent.parent / "frontend" / "dist"
        if docker_path.exists():
            return docker_path
        return Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


settings = Settings()
