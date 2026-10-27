"""Shared image pipeline: resize (max ~2000 px on the long edge), convert to
WebP (HEIC/HEIF included) and store in the uploads volume."""

import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from PIL import Image
import pillow_heif

from app.config import settings

MAX_SIZE = 2000
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

_EXIF_DATETIME_ORIGINAL = 36867  # DateTimeOriginal, lives in the EXIF IFD
_EXIF_DATETIME_DIGITIZED = 36868  # fallback when the camera filled only this
_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825


def _gps_coord_to_float(value, ref: str) -> Optional[float]:
    """Convert an EXIF GPS coordinate (deg, min, sec rationals + N/S/E/W)."""
    try:
        degrees, minutes, seconds = (float(v) for v in value)
    except (TypeError, ValueError):
        return None
    result = degrees + minutes / 60 + seconds / 3600
    if ref in ("S", "W"):
        result = -result
    return result


def extract_exif(content: bytes, content_type: str) -> tuple[Optional[datetime], Optional[float], Optional[float]]:
    """Best-effort EXIF extraction from the ORIGINAL bytes (WebP conversion
    strips metadata). Returns (taken_at, lat, lon); anything missing is None.

    Capture time has no timezone in EXIF, so it is interpreted as UTC.
    HEIC/HEIF is skipped silently: pillow_heif does not expose EXIF through
    the API this project uses."""
    if content_type in ("image/heic", "image/heif"):
        return None, None, None

    taken_at: Optional[datetime] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    try:
        image = Image.open(io.BytesIO(content))
        exif = image.getexif()

        exif_ifd = exif.get_ifd(_EXIF_IFD)
        raw_dt = exif_ifd.get(_EXIF_DATETIME_ORIGINAL) or exif_ifd.get(_EXIF_DATETIME_DIGITIZED)
        if not raw_dt:
            # Some tools write the tag at top level instead of the EXIF IFD.
            raw_dt = exif.get(_EXIF_DATETIME_ORIGINAL) or exif.get(_EXIF_DATETIME_DIGITIZED)
        if raw_dt:
            try:
                taken_at = datetime.strptime(str(raw_dt), "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                taken_at = None

        gps_ifd = exif.get_ifd(_GPS_IFD)
        if gps_ifd:
            lat = _gps_coord_to_float(gps_ifd.get(2), str(gps_ifd.get(1, "N")))
            lon = _gps_coord_to_float(gps_ifd.get(4), str(gps_ifd.get(3, "E")))
    except Exception:
        # EXIF is a nice-to-have; a broken or unusual file must not fail the upload.
        return None, None, None

    return taken_at, lat, lon


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
