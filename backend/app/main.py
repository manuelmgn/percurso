import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import router as api_router
from app.core.config import get_settings
from app.core.limiter import limiter
from app.core.redis import close_redis

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_redis()


app = FastAPI(
    title="Percurso API",
    version="1.0.0",
    docs_url="/api/docs" if settings.is_development else None,
    redoc_url="/api/redoc" if settings.is_development else None,
    openapi_url="/api/openapi.json" if settings.is_development else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://i.ibb.co https://image.pollinations.ai; "
    "connect-src 'self' https:; "
    "frame-ancestors 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        response.headers["Content-Security-Policy"] = _CSP
        # Key HSTS on X-Forwarded-Proto so it is sent even behind a TLS-terminating proxy.
        proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
        if proto == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)

app.include_router(api_router)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    if not errors:
        return JSONResponse(status_code=422, content={"detail": "Dados inválidos"})

    first = errors[0]
    loc = first.get("loc", ())
    field = loc[-1] if len(loc) > 1 and not isinstance(loc[-1], int) else None
    type_ = first.get("type", "")
    ctx = first.get("ctx", {}) or {}
    raw_msg: str = first.get("msg", "") or ""

    if isinstance(ctx.get("error"), str):
        msg = ctx["error"]
    elif raw_msg.startswith("Value error, "):
        msg = raw_msg[13:]
    elif type_ == "missing":
        msg = "campo obrigatório"
    elif "email" in type_ or "email address" in raw_msg.lower():
        msg = "endereço de email inválido"
    elif "url" in type_:
        msg = "URL inválido"
    elif type_ == "string_too_short":
        msg = f"mínimo {ctx.get('min_length', '?')} caracteres"
    elif type_ == "string_too_long":
        msg = f"máximo {ctx.get('max_length', '?')} caracteres"
    else:
        msg = raw_msg or "valor inválido"

    detail = f"{field}: {msg}" if field else msg
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, HTTPException):
        return await http_exception_handler(request, exc)
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Ocorreu um erro inesperado. Por favor, tenta novamente."},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


_static_dir = Path(__file__).parent.parent / "static"
_static_dir_resolved = _static_dir.resolve()

if _static_dir.is_dir():

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Never serve the SPA shell for API paths — return 404 so the client
        # sees a clear error instead of HTML that looks like a 200.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        if full_path:
            candidate = (_static_dir / full_path).resolve()
            try:
                candidate.relative_to(_static_dir_resolved)
                if candidate.is_file():
                    return FileResponse(str(candidate))
            except ValueError:
                raise HTTPException(status_code=400, detail="Caminho inválido")
        index = _static_dir / "index.html"
        if index.is_file():
            return FileResponse(str(index))
        raise HTTPException(status_code=404, detail="Not Found")
