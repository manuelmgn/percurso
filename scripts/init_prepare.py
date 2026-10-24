#!/usr/bin/env python3
import os
import sys
from pathlib import Path

# Ensure dirs exist
data_dir = Path(os.environ.get("PERCURSOS_DATA_DIR", "/data"))
uploads_dir = Path(os.environ.get("PERCURSOS_UPLOADS_DIR", "/app/uploads"))
tiles_dir = Path(os.environ.get("PERCURSOS_TILE_CACHE_DIR", "/app/tile-cache"))
backups_dir = Path(os.environ.get("PERCURSOS_BACKUPS_DIR", "/backups"))

for d in [data_dir, uploads_dir, tiles_dir, backups_dir, Path("/var/log")]:
    d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(d, 0o755)
    except Exception:
        pass

# Run DB schema + migrations
sys.path.insert(0, "/app")
from app.main import _apply_lightweight_migrations
from app.core.db import engine, Base
from app import models  # ensure models imported

Base.metadata.create_all(bind=engine)
_apply_lightweight_migrations(engine)

# Seed admin if needed
try:
    from app.core.db import SessionLocal
    from app.services import user_service
    db = SessionLocal()
    try:
        user_service.seed_default_admin(db)
    finally:
        db.close()
except Exception as e:
    print(f"init: seed warning: {e}", flush=True)

print("init: preparation complete", flush=True)
