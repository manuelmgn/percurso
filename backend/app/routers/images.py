from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.auth import validate_csrf
from app.config import settings
from app.models import User
from app.schemas import ImageUploadResponse
from app.services import image_service

router = APIRouter(prefix="/api/images", tags=["images"])


@router.post("/", response_model=ImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(validate_csrf),
):
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Ficheiro demasiado grande (máx. 15 MB)")
    url, width, height = image_service.process_and_save(content, file.content_type or "")
    return ImageUploadResponse(url=url, width=width, height=height)
