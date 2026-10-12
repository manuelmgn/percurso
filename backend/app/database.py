from contextlib import contextmanager
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from app.config import settings

settings.data_dir.mkdir(parents=True, exist_ok=True)
settings.uploads_dir.mkdir(parents=True, exist_ok=True)
settings.tile_cache_dir.mkdir(parents=True, exist_ok=True)
settings.backups_dir.mkdir(parents=True, exist_ok=True)

if not settings.database_url_override:
    # Local development uses SQLite: make sure the database file exists from
    # the start. SQLite would create it lazily on the first connection anyway.
    (settings.data_dir / "percursos.db").touch(exist_ok=True)

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    # check_same_thread is a SQLite-only setting; other dialects use their defaults
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    echo=settings.env == "development",
)


if _is_sqlite:
    # SQLite pragmas only — other dialects (e.g. PostgreSQL) don't support these
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@contextmanager
def db_session():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db():
    with db_session() as session:
        yield session
