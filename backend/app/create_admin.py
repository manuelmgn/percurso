"""Run after migrations: create an admin user from env vars if all three are set."""
import asyncio
import os
import sys


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "").strip()
    username = os.environ.get("ADMIN_USERNAME", "").strip()
    password = os.environ.get("ADMIN_PASSWORD", "").strip()

    if not (email and username and password):
        return

    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import get_settings
    from app.core.security import hash_password
    from app.models.user import User
    from app.services.user_service import get_user_by_email, get_user_by_username

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as db:
            if await get_user_by_email(db, email) or await get_user_by_username(db, username):
                print(f"Admin user already exists, skipping", flush=True)
                return

            db.add(User(
                username=username,
                email=email,
                hashed_password=hash_password(password),
                display_name=username,
                role="admin",
                is_active=True,
            ))
            await db.commit()
            print(f"Admin user created: {username}", flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
