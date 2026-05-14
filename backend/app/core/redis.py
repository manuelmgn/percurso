from functools import lru_cache

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

_redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


async def store_refresh_jti(jti: str, ttl_seconds: int) -> None:
    redis = await get_redis()
    await redis.setex(f"jti:refresh:{jti}", ttl_seconds, "1")


async def verify_and_revoke_refresh_jti(jti: str) -> bool:
    """Atomically check existence and delete. Returns True if the JTI was valid."""
    redis = await get_redis()
    result = await redis.getdel(f"jti:refresh:{jti}")
    return result is not None


async def revoke_refresh_jti(jti: str) -> None:
    redis = await get_redis()
    await redis.delete(f"jti:refresh:{jti}")
