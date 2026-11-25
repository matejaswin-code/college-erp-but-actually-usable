import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.models import Base, engine
from app.routers import academics, admin, auth, coursework, fees, notifications, students

app = FastAPI(title=settings.APP_NAME, version="1.0.0")

origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


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


@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    _ensure_initialized()
    # Lets the frontend call /api/... both behind nginx (which strips it) and in a plain local run.
    path = request.scope["path"]
    if path == "/api" or path.startswith("/api/"):
        request.scope["path"] = path[4:] or "/"
    return await call_next(request)


for r in (auth.router, students.router, academics.router, coursework.router,
          fees.router, notifications.router, admin.router):
    app.include_router(r)


@app.get("/health")
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
