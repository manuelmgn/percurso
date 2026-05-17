from fastapi import Request
from slowapi import Limiter


def _real_ip(request: Request) -> str:
    """Return the real client IP, honouring the X-Forwarded-For header set by
    Railway / nginx when uvicorn is started with --proxy-headers."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_real_ip)
