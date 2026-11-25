import os
from urllib.parse import parse_qsl, urlencode

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.models import Base, engine
from app.routers import academics, admin, auth, coursework, fees, notifications, students

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

_initialized = False


def _ensure_initialized():
    global _initialized
    if _initialized:
        return
    try:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    except OSError:
        pass
    # In Docker, Alembic creates tables first. For local runs and Vercel, create them here.
    if os.environ.get("CREATE_TABLES", "true").lower() == "true":
        Base.metadata.create_all(bind=engine)
    # On Vercel serverless cold starts, seed demo data once (idempotent).
    if os.environ.get("VERCEL") and settings.RUN_SEED_ON_START:
        from sqlalchemy.exc import IntegrityError
        from app.seed import seed
        try:
            seed(reset=False)
        except IntegrityError:
            pass
    _initialized = True


class RequestInitAndPathMiddleware:
    """Pure ASGI middleware: runs lazy DB init and restores paths forwarded by Vercel rewrites."""

    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            _ensure_initialized()
            raw_qs = scope.get("query_string", b"").decode("latin-1")
            if "__path=" in raw_qs:
                params = parse_qsl(raw_qs, keep_blank_values=True)
                restored_path = None
                kept = []
                for k, v in params:
                    if k == "__path" and restored_path is None:
                        restored_path = v if v.startswith("/") else "/" + v
                    else:
                        kept.append((k, v))
                if restored_path is not None:
                    scope = dict(scope)
                    scope["path"] = restored_path
                    scope["raw_path"] = restored_path.encode("latin-1")
                    scope["query_string"] = urlencode(kept).encode("latin-1")
        await self.asgi_app(scope, receive, send)


origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(RequestInitAndPathMiddleware)


for r in (auth.router, students.router, academics.router, coursework.router,
          fees.router, notifications.router, admin.router):
    app.include_router(r)
    app.include_router(r, prefix="/api")


@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup():
    _ensure_initialized()


# Serve the frontend from the same process (local dev & single-container deploys).
# Mounted last so API routes take precedence.
FRONTEND_DIR = settings.FRONTEND_DIR or os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
)
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
