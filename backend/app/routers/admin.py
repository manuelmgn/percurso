from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import require_admin, validate_csrf
from app.models import User
from app.schemas import UserResponse
from app.services import user_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/backup")
def manual_backup(
    db: Session = Depends(get_db),
    admin: User = Depends(validate_csrf),
):
    if not admin.is_admin():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")

    from app.backup import run_backup
    run_backup()
    return {"message": "Backup completed"}
