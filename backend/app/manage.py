"""CLI management commands for Percursos (e.g. running inside Docker)."""

import sys
from app.config import settings
from app.database import db_session
from app.models import User, UserRole
from app.auth import hash_password
from app.services import user_service
from app.backup import run_backup


def seed_admin_cmd():
    with db_session() as db:
        user = user_service.seed_default_admin(db)
        if user:
            print(f"Admin '{user.username}' criado com sucesso.")
        else:
            print("A base de dados já contém utilizadores. Nada a fazer.")


def reset_admin_cmd(username: str | None = None, password: str | None = None):
    target_username = (username or settings.default_admin_username).strip().lower()
    target_password = password or settings.default_admin_password

    with db_session() as db:
        user = user_service.get_user_by_username(db, target_username)
        if user:
            user.password_hash = hash_password(target_password)
            user.role = UserRole.ADMIN
            user.is_active = True
            db.commit()
            print(f"Palavra-passe do administrador '{target_username}' redefinida com sucesso.")
        else:
            user = User(
                username=target_username,
                password_hash=hash_password(target_password),
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(user)
            db.commit()
            print(f"Administrador '{target_username}' criado com sucesso.")


def backup_cmd():
    bdir = run_backup()
    print(f"Backup concluído em: {bdir}")


def main():
    if len(sys.argv) < 2:
        print("Uso: python -m app.manage <seed-admin | reset-admin [username] [password] | backup>")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "seed-admin":
        seed_admin_cmd()
    elif cmd == "reset-admin":
        u = sys.argv[2] if len(sys.argv) > 2 else None
        p = sys.argv[3] if len(sys.argv) > 3 else None
        reset_admin_cmd(u, p)
    elif cmd == "backup":
        backup_cmd()
    else:
        print(f"Comando desconhecido: {cmd}")
        sys.exit(1)


if __name__ == "__main__":
    main()
