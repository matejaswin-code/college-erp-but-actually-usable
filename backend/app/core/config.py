import os

from pydantic import field_validator
from pydantic_settings import BaseSettings

IS_VERCEL = bool(os.environ.get("VERCEL"))


class Settings(BaseSettings):
    APP_NAME: str = "Sample Institute of Technology ERP"
    DATABASE_URL: str = (
        "sqlite:////tmp/dev.db" if IS_VERCEL else "postgresql+psycopg2://erp:erp@db:5432/erp"
    )
    JWT_SECRET: str = "dev-only-change-me-to-a-long-random-secret-key-32chars"
    JWT_EXPIRE_MINUTES: int = 60
    UPLOAD_DIR: str = "/tmp/uploads" if IS_VERCEL else "/data/uploads"
    FRONTEND_DIR: str = ""
    MOCK_PAYMENT_FAIL_RATE: float = 0.0
    RUN_SEED_ON_START: bool = True
    COOKIE_SECURE: bool = IS_VERCEL
    CORS_ORIGINS: str = "http://localhost:8080"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if isinstance(value, str):
            if value.startswith("postgres://"):
                return "postgresql+psycopg2://" + value[len("postgres://"):]
            if value.startswith("postgresql://"):
                return "postgresql+psycopg2://" + value[len("postgresql://"):]
        return value


settings = Settings()
