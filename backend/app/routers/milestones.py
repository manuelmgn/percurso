from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import validate_csrf
from app.schemas import MilestoneCheckResponse
from app.services import milestone_service

router = APIRouter(prefix="/api/milestones", tags=["milestones"])


@router.post("/check", response_model=MilestoneCheckResponse)
def check(
    db: Session = Depends(get_db),
    user=Depends(validate_csrf),
):
    return MilestoneCheckResponse(new_milestones=milestone_service.check_milestones(db, user))
