from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="PERCURSOS_")

    env: str = "development"
    secret_key: str = "dev-secret-key-change-in-production"
    data_dir: Path = Path(__file__).resolve().parent.parent / "data"
    uploads_dir: Path = Path(__file__).resolve().parent.parent / "uploads"
    tile_cache_dir: Path = Path(__file__).resolve().parent.parent / "tile-cache"
    backups_dir: Path = Path(__file__).resolve().parent.parent / "backups"
    backup_retention_days: int = 30
    session_cookie_name: str = "session"
    session_max_age_days: int = 30
    csrf_token_bytes: int = 32

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.data_dir / 'percursos.db'}"

    @property
    def frontend_dist(self) -> Path:
        # Docker layout: /app/frontend/dist; local dev layout: <repo>/frontend/dist
        docker_path = Path(__file__).resolve().parent.parent / "frontend" / "dist"
        if docker_path.exists():
            return docker_path
        return Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


settings = Settings()
