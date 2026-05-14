import base64
import logging

import httpx

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
_IMGBB_URL = "https://api.imgbb.com/1/upload"


def _detect_mime_type(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def upload_to_imgbb(image_bytes: bytes, name: str = "cover") -> tuple[str, str]:
    """Upload raw bytes to ImgBB. Returns (url, delete_url)."""
    from app.core.config import get_settings
    settings = get_settings()
    encoded = base64.b64encode(image_bytes).decode("utf-8")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                _IMGBB_URL,
                data={"key": settings.imgbb_api_key, "image": encoded, "name": name},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.error("ImgBB request failed: %s", exc)
        raise RuntimeError("Não foi possível guardar a imagem. Tenta novamente.") from exc
    if not data.get("success"):
        raise RuntimeError("Não foi possível guardar a imagem. Tenta novamente.")
    return data["data"]["url"], data["data"]["delete_url"]


async def delete_from_imgbb(delete_url: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.get(delete_url)
    except Exception as exc:
        logger.warning("ImgBB delete failed: %s", exc)


async def upload_cover_image(
    file_content: bytes,
    original_filename: str,
) -> tuple[str, str]:
    """Validate and upload a cover image file. Returns (url, delete_url)."""
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise ValueError("A imagem não pode ter mais de 10MB.")
    detected = _detect_mime_type(file_content)
    if detected is None or detected not in ALLOWED_MIME_TYPES:
        raise ValueError("Formato não suportado. Usa JPEG, PNG ou WebP.")
    name = (original_filename.rsplit(".", 1)[0][:50] or "cover")
    return await upload_to_imgbb(file_content, name)
