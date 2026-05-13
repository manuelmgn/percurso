"""
Management script: verify and reset the admin user from env vars.

Usage (Railway):
    railway run python -m app.reset_admin

Usage (Docker Compose):
    docker compose exec backend python -m app.reset_admin

Reads:  ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD
Does:
  - If a user with ADMIN_EMAIL exists: prints their details and updates
    their password from ADMIN_PASSWORD.
  - If no user with ADMIN_EMAIL exists: creates them fresh with role=admin.
"""
import asyncio
import os

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# All mapped classes must be registered before any query fires.
from app.models.user import User  # noqa: F401
from app.models.place import Place  # noqa: F401
from app.models.trip import Trip, TripCompanion, TripPlace, TripMediaLink, TripSharedUser  # noqa: F401
from app.models.project import Project, ProjectCollaborator, ProjectTargetPlace, ProjectSharedUser  # noqa: F401
from app.models.notification import Notification  # noqa: F401

from app.services.user_service import (
    create_user,
    get_user_by_email,
    change_password,
)
from app.schemas.user import UserCreate
from app.core.config import get_settings
from app.core.security import hash_password


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "").strip()
    username = os.environ.get("ADMIN_USERNAME", "").strip()
    password = os.environ.get("ADMIN_PASSWORD", "").strip()

    if not email:
        print("ERROR: ADMIN_EMAIL is not set.", flush=True)
        return
    if not password:
        print("ERROR: ADMIN_PASSWORD is not set.", flush=True)
        return

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as db:
            user = await get_user_by_email(db, email)

            if user:
                print(f"User found:", flush=True)
                print(f"  username  : {user.username}", flush=True)
                print(f"  email     : {user.email}", flush=True)
                print(f"  role      : {user.role}", flush=True)
                print(f"  is_active : {user.is_active}", flush=True)

                user.hashed_password = hash_password(password)
                await db.commit()
                print("Password updated successfully.", flush=True)

            else:
                print(f"No user found with email '{email}'. Creating...", flush=True)

                if not username:
                    print("ERROR: ADMIN_USERNAME is not set — needed to create user.", flush=True)
                    return

                from pydantic import ValidationError
                try:
                    data = UserCreate(
                        username=username,
                        email=email,
                        password=password,
                        display_name=username,
                        role="admin",
                    )
                except ValidationError as exc:
                    print(f"ERROR: invalid env var values: {exc}", flush=True)
                    return

                await create_user(db, data)
                await db.commit()
                print(f"Admin user created: {data.username}", flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
