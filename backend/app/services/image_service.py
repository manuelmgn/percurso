"""Shared image pipeline: resize (max ~2000 px on the long edge), convert to
WebP (HEIC/HEIF included) and store in the uploads volume."""

import io
import uuid

from fastapi import HTTPException, status
from PIL import Image
import pillow_heif

from app.config import settings

MAX_SIZE = 2000
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def process_and_save(content: bytes, content_type: str) -> tuple[str, int, int]:
    """Process raw image bytes and save as WebP. Returns (url, width, height)."""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tipo de ficheiro não suportado",
        )

    try:
        if content_type in ("image/heic", "image/heif"):
            heif_file = pillow_heif.read_heif(io.BytesIO(content))
            image = Image.frombytes(heif_file.mode, heif_file.size, heif_file.data, "raw")
        else:
            image = Image.open(io.BytesIO(content))
            image.load()  # fully decode now, the BytesIO is closed by the caller

        if image.mode in ("RGBA", "P", "LA"):
            image = image.convert("RGB")

        width, height = image.size
        if max(width, height) > MAX_SIZE:
            if width > height:
                new_size = (MAX_SIZE, int(height * MAX_SIZE / width))
            else:
                new_size = (int(width * MAX_SIZE / height), MAX_SIZE)
            image = image.resize(new_size, Image.Resampling.LANCZOS)

        output = io.BytesIO()
        image.save(output, format="WEBP", quality=85, method=6)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao processar imagem: {str(e)}",
        )

    filename = f"{uuid.uuid4().hex}.webp"
    (settings.uploads_dir / filename).write_bytes(output.getvalue())
    return f"/uploads/{filename}", image.width, image.height
