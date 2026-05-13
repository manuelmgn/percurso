"""CLI utilities for Percurso administration."""

import asyncio
import sys

import click


@click.group()
def cli():
    pass


@cli.command("create-admin")
@click.option("--username", prompt=True)
@click.option("--email", prompt=True)
@click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True)
@click.option("--display-name", prompt=True)
def create_admin(username: str, email: str, password: str, display_name: str):
    """Create the first admin user."""
    asyncio.run(_create_admin(username, email, password, display_name))


async def _create_admin(username: str, email: str, password: str, display_name: str):
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import get_settings
    from app.schemas.user import UserCreate
    from app.services.user_service import create_user, get_user_by_username

    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        existing = await get_user_by_username(db, username)
        if existing:
            click.echo(f"Erro: utilizador '{username}' já existe.")
            sys.exit(1)

        data = UserCreate(
            username=username,
            email=email,
            password=password,
            display_name=display_name,
            role="admin",
        )
        user = await create_user(db, data)
        await db.commit()
        click.echo(f"Administrador '{user.username}' criado com sucesso.")

    await engine.dispose()


if __name__ == "__main__":
    cli()
