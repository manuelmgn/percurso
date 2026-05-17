from sqlalchemy import Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SiteSettings(Base):
    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    allow_public_profiles_without_auth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
