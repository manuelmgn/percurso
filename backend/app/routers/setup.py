from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import SetupRequest, PublicStatus, UserCreate
from app.services import user_service
from app.models import UserRole

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/status", response_model=PublicStatus)
def setup_status(db: Session = Depends(get_db)):
    return {"setup_required": not user_service.has_users(db)}


@router.post("/", status_code=status.HTTP_201_CREATED)
def complete_setup(payload: SetupRequest, db: Session = Depends(get_db)):
    if user_service.has_users(db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup already completed")

    admin = user_service.create_user(
        db,
        UserCreate(
            username=payload.admin_username,
            password=payload.admin_password,
            role=UserRole.ADMIN,
        ),
    )

    if payload.second_username and payload.second_password:
        user_service.create_user(
            db,
            UserCreate(
                username=payload.second_username,
                password=payload.second_password,
                role=UserRole.USER,
            ),
        )

    return {"message": "Setup complete", "admin_id": admin.id}
