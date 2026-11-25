import os
import re
import uuid

from fastapi import HTTPException, UploadFile

from app.core.config import settings

MAX_BYTES = 10 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".txt", ".zip", ".png", ".jpg", ".jpeg", ".xlsx"}


def safe_name(name: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(name or "file"))
    return base[:120] or "file"


async def save_upload(file: UploadFile, subdir: str) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"File type {ext or 'unknown'} not allowed")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(400, "File too large (max 10 MB)")
    folder = os.path.join(settings.UPLOAD_DIR, subdir)
    os.makedirs(folder, exist_ok=True)
    stored = f"{uuid.uuid4().hex}_{safe_name(file.filename)}"
    with open(os.path.join(folder, stored), "wb") as fh:
        fh.write(data)
    return os.path.join(subdir, stored)


def absolute(rel_path: str) -> str:
    return os.path.join(settings.UPLOAD_DIR, rel_path)
