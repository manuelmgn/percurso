"""Run after migrations: create an admin user from env vars if all three are set."""
import asyncio
import os


async def main() -> None:
    email = os.environ.get("ADMIN_EMAIL", "").strip()
    username = os.environ.get("ADMIN_USERNAME", "").strip()
    password = os.environ.get("ADMIN_PASSWORD", "").strip()

    if not (email and username and password):
        return

    from pydantic import ValidationError
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import get_settings
    from app.schemas.user import UserCreate
    from app.services.user_service import create_user, get_user_by_email, get_user_by_username
    # All models must be imported so SQLAlchemy can resolve relationship references
    import app.models.place       # noqa: F401
    import app.models.trip        # noqa: F401
    import app.models.project     # noqa: F401
    import app.models.notification  # noqa: F401

    # Validate inputs through the same schema the rest of the app uses.
    # UserCreate lowercases the username and validates the email with EmailStr.
    try:
        data = UserCreate(
            username=username,
            email=email,
            password=password,
            display_name=username,
            role="admin",
        )
    except ValidationError as exc:
        print(f"Admin user env vars are invalid, skipping: {exc}", flush=True)
        return

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with session_factory() as db:
            if await get_user_by_email(db, data.email) or await get_user_by_username(db, data.username):
                print("Admin user already exists, skipping", flush=True)
                return

            await create_user(db, data)
            await db.commit()
            print(f"Admin user created: {data.username}", flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
