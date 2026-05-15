from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    environment: Literal["development", "production", "test"] = "development"
    secret_key: str
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    @field_validator("access_token_expire_minutes")
    @classmethod
    def ensure_minimum_token_lifetime(cls, v: int) -> int:
        if v < 30:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be at least 30")
        return v
    allowed_origins: list[str] = ["http://localhost:5173"]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, v: str | list) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # Database
    # Railway injects postgresql:// — normalised to the correct driver prefix by validators below
    database_url: str
    database_sync_url: str = ""

    @field_validator("database_url", mode="before")
    @classmethod
    def normalise_async_scheme(cls, v: str) -> str:
        for prefix in ("postgresql://", "postgres://"):
            if v.startswith(prefix):
                return "postgresql+asyncpg://" + v[len(prefix):]
        return v

    @model_validator(mode="after")
    def derive_sync_url(self) -> "Settings":
        if not self.database_sync_url:
            self.database_sync_url = self.database_url.replace(
                "postgresql+asyncpg://", "postgresql+psycopg2://", 1
            )
        return self

    # Redis
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"
    wikipedia_cache_ttl: int = 604800  # 7 days

    # ImgBB (image hosting)
    imgbb_api_key: str = ""

    # Anthropic (AI cover prompt extraction)
    anthropic_api_key: str = ""

    # OSM / Nominatim
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"
    overpass_api_url: str = "https://overpass-api.de/api/interpreter"
    osm_user_agent_email: str = ""

    # Rate limiting
    rate_limit_default: int = 60
    rate_limit_auth: int = 10

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
