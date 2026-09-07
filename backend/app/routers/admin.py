from fastapi import APIRouter, Depends

from app.auth import require_admin_csrf
from app.models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/backup")
def manual_backup(admin: User = Depends(require_admin_csrf)):
    from app.backup import run_backup

    backup_dir = run_backup()
    return {"message": "Backup concluído", "backup": backup_dir.name}
