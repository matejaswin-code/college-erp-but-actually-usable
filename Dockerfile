FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    FRONTEND_DIR=/app/frontend \
    UPLOAD_DIR=/data/uploads \
    COOKIE_SECURE=true \
    RUN_SEED_ON_START=true \
    CREATE_TABLES=false

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend /app/backend
COPY frontend /app/frontend

WORKDIR /app/backend
EXPOSE 8080

# Prepare upload directory, run migrations, optionally seed (idempotent), then start API + frontend.
CMD ["sh", "-c", "mkdir -p \"$UPLOAD_DIR\" && alembic upgrade head && if [ \"$RUN_SEED_ON_START\" = \"true\" ]; then python -m app.seed; fi && exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8080}\" --proxy-headers --forwarded-allow-ips=\"*\""]
