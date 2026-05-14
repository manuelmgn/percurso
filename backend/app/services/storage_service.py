import io
import mimetypes
import uuid
from typing import Literal

import boto3
from botocore.config import Config

from app.core.config import get_settings

settings = get_settings()

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def _detect_mime_type(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None

EntityType = Literal["trip", "project"]


def _get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _build_key(user_id: int, entity_type: EntityType, entity_id: int, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    unique = uuid.uuid4().hex
    return f"{user_id}/{entity_type}/{entity_id}/{unique}.{ext}"


async def upload_cover_image(
    user_id: int,
    entity_type: EntityType,
    entity_id: int,
    file_content: bytes,
    original_filename: str,
    content_type: str,
) -> str:
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise ValueError("O ficheiro excede o tamanho máximo de 10 MB")
    detected = _detect_mime_type(file_content)
    if detected is None or detected not in ALLOWED_MIME_TYPES:
        raise ValueError("Tipo de ficheiro não permitido. Aceites: JPEG, PNG, WebP")
    content_type = detected  # use detected type, not the user-supplied header

    key = _build_key(user_id, entity_type, entity_id, original_filename)
    client = _get_r2_client()
    client.put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=file_content,
        ContentType=content_type,
    )
    return f"{settings.r2_public_url}/{key}"


async def upload_bytes_as_image(
    user_id: int,
    entity_type: EntityType,
    entity_id: int,
    image_bytes: bytes,
    filename: str = "cover.jpg",
    content_type: str = "image/jpeg",
) -> str:
    key = _build_key(user_id, entity_type, entity_id, filename)
    client = _get_r2_client()
    client.put_object(
        Bucket=settings.r2_bucket_name,
        Key=key,
        Body=image_bytes,
        ContentType=content_type,
    )
    return f"{settings.r2_public_url}/{key}"


async def delete_object(key_or_url: str) -> None:
    key = key_or_url.removeprefix(f"{settings.r2_public_url}/")
    client = _get_r2_client()
    client.delete_object(Bucket=settings.r2_bucket_name, Key=key)
