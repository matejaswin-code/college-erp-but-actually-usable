import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import current_user, get_db
from app.core.security import create_token, hash_password, verify_password
from app.models import Faculty, Student, User

router = APIRouter(prefix="/auth", tags=["auth"])

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 900
_attempts: dict[str, list[float]] = defaultdict(list)


class LoginIn(BaseModel):
    login: str
    password: str


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


def display_name(db: Session, user: User) -> str:
    if user.role == "student":
        s = db.query(Student).filter(Student.user_id == user.id).first()
        return s.name if s else user.login_id
    if user.role == "faculty":
        f = db.query(Faculty).filter(Faculty.user_id == user.id).first()
        return f.name if f else user.login_id
    return "Administrator"


def user_payload(db: Session, user: User) -> dict:
    return {"id": user.id, "login_id": user.login_id, "email": user.email,
            "role": user.role, "name": display_name(db, user)}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    ident = body.login.strip()
    xff = request.headers.get("x-forwarded-for")
    client_ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "x")
    key = f"{client_ip}|{ident.lower()}"
    now = time.time()
    _attempts[key] = [t for t in _attempts[key] if now - t < WINDOW_SECONDS]
    if len(_attempts[key]) >= MAX_ATTEMPTS:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

    user = db.query(User).filter(or_(User.login_id == ident.upper(),
                                     User.email == ident.lower())).first()
    if not user or not verify_password(body.password, user.password_hash):
        _attempts[key].append(now)
        raise HTTPException(401, "Invalid login or password")
    if not user.is_active:
        raise HTTPException(403, "This account is deactivated. Contact admin.")

    _attempts.pop(key, None)
    response.set_cookie("access_token", create_token(user.id, user.role), httponly=True,
                        samesite="lax", secure=settings.COOKIE_SECURE,
                        max_age=settings.JWT_EXPIRE_MINUTES * 60)
    return user_payload(db, user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", httponly=True, samesite="lax",
                           secure=settings.COOKIE_SECURE)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return user_payload(db, user)


@router.post("/change-password")
def change_password(body: PasswordIn, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
