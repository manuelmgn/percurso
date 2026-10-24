#!/usr/bin/env python3
"""Backup script for Percursos data and uploads."""

import shutil
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path

from app.config import settings


def run_backup():
    if settings.database_url_override:
        raise RuntimeError(
            "Cópia de segurança automática apenas suportada para SQLite. "
            "Para bases de dados externas utilize a ferramenta de backup do seu provedor."
        )

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
            except subprocess.CalledProcessError as exc:
                raise RuntimeError("Falha ao criar cópia de segurança da base de dados") from exc
    else:
        raise RuntimeError("Ficheiro de base de dados SQLite não encontrado")

    uploads_backup = backup_dir / "uploads"
    if settings.uploads_dir.exists():
        shutil.copytree(settings.uploads_dir, uploads_backup, dirs_exist_ok=True)

    # Rotate old backups
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.backup_retention_days)
    if settings.backups_dir.exists():
        for item in settings.backups_dir.iterdir():
            if item.is_dir() and item.name.startswith("backup_"):
                try:
                    item_time = datetime.strptime(item.name, "backup_%Y%m%d_%H%M%S").replace(tzinfo=timezone.utc)
                    if item_time < cutoff:
                        shutil.rmtree(item)
                except ValueError:
                    continue

    print(f"Backup concluído: {backup_dir}")
    return backup_dir


if __name__ == "__main__":
    run_backup()
