#!/usr/bin/env python3
"""Weekly backup script for Percursos data and uploads."""

import shutil
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

from app.config import settings


def run_backup():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_dir = Path(settings.backups_dir) / f"backup_{timestamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)

    db_source = settings.data_dir / "percursos.db"
    db_backup = backup_dir / "percursos.db"

    if db_source.exists():
        # Use SQLite backup API for a consistent online snapshot
        try:
            import sqlite3
            src = sqlite3.connect(str(db_source))
            dest = sqlite3.connect(str(db_backup))
            with dest:
                src.backup(dest)
            dest.close()
            src.close()
        except Exception:
            try:
                subprocess.run(
                    ["sqlite3", str(db_source), f".backup '{db_backup}'"],
                    check=True,
                )
            except subprocess.CalledProcessError:
                raise RuntimeError("Falha ao criar cópia de segurança da base de dados")

    uploads_backup = backup_dir / "uploads"
    if settings.uploads_dir.exists():
        shutil.copytree(settings.uploads_dir, uploads_backup, dirs_exist_ok=True)

    # Rotate old backups
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.backup_retention_days)
    for item in settings.backups_dir.iterdir():
        if item.is_dir() and item.name.startswith("backup_"):
            try:
                item_time = datetime.strptime(item.name, "backup_%Y%m%d_%H%M%S").replace(tzinfo=timezone.utc)
                if item_time < cutoff:
                    shutil.rmtree(item)
            except ValueError:
                continue

    print(f"Backup completed: {backup_dir}")
    return backup_dir


if __name__ == "__main__":
    run_backup()
