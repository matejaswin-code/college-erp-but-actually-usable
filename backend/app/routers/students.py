from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.models import Department, Student, User
from app.core.security import hash_password
from app.services.enrollment import enroll_student

router = APIRouter(prefix="/students", tags=["students"])


def student_out(s: Student, db: Session) -> dict:
    dept = db.get(Department, s.dept_id)
    return {"id": s.id, "usn": s.usn, "name": s.name, "dept": dept.name if dept else "",
            "dept_code": dept.code if dept else "", "semester": s.semester,
            "section": s.section, "batch_year": s.batch_year,
            "dob": s.dob.isoformat() if s.dob else None, "gender": s.gender,
            "phone": s.phone, "address": s.address, "blood_group": s.blood_group,
            "guardian_name": s.guardian_name, "guardian_phone": s.guardian_phone,
            "email": db.get(User, s.user_id).email}


class StudentIn(BaseModel):
    usn: str
    name: str
    dept_id: int
    semester: int
    section: str
    batch_year: int
    password: str
    email: str | None = None
    dob: date | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None
    blood_group: str | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None


class StudentUpdate(BaseModel):
    name: str | None = None
    semester: int | None = None
    section: str | None = None
    phone: str | None = None
    address: str | None = None
    blood_group: str | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None


@router.get("/me")
def my_profile(user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = db.query(Student).filter(Student.user_id == user.id).first()
    if not s:
        raise HTTPException(404, "Student profile not found")
    return student_out(s, db)


@router.put("/me")
def update_my_profile(body: StudentUpdate, user=Depends(require_roles("student")),
                      db: Session = Depends(get_db)):
    """Students may edit only contact and guardian details, not academic fields."""
    s = db.query(Student).filter(Student.user_id == user.id).first()
    for field in ("phone", "address", "blood_group", "guardian_name", "guardian_phone"):
        val = getattr(body, field)
        if val is not None:
            setattr(s, field, val)
    db.commit()
    return student_out(s, db)


@router.get("")
def list_students(q: str | None = None, dept_id: int | None = None, semester: int | None = None,
                  section: str | None = None, user=Depends(require_roles("admin")),
                  db: Session = Depends(get_db)):
    query = db.query(Student)
    if q:
        like = f"%{q}%"
        query = query.filter((Student.name.ilike(like)) | (Student.usn.ilike(like)))
    if dept_id:
        query = query.filter(Student.dept_id == dept_id)
    if semester:
        query = query.filter(Student.semester == semester)
    if section:
        query = query.filter(Student.section == section)
    return [student_out(s, db) for s in query.order_by(Student.usn).limit(500)]


@router.post("")
def create_student(body: StudentIn, user=Depends(require_roles("admin")),
                   db: Session = Depends(get_db)):
    usn = body.usn.strip().upper()
    if db.query(User).filter(User.login_id == usn).first():
        raise HTTPException(400, f"USN {usn} already exists")
    email = (body.email or f"{body.name.split()[0].lower()}.{usn.lower()}@sit-demo.edu.in").lower()
    u = User(login_id=usn, email=email, password_hash=hash_password(body.password), role="student")
    db.add(u)
    db.flush()
    s = Student(user_id=u.id, usn=usn, name=body.name, dept_id=body.dept_id,
                semester=body.semester, section=body.section.upper(), batch_year=body.batch_year,
                dob=body.dob, gender=body.gender, phone=body.phone, address=body.address,
                blood_group=body.blood_group, guardian_name=body.guardian_name,
                guardian_phone=body.guardian_phone)
    db.add(s)
    db.flush()
    enroll_student(db, s)
    db.commit()
    return student_out(s, db)


@router.put("/{student_id}")
def update_student(student_id: int, body: StudentUpdate, user=Depends(require_roles("admin")),
                   db: Session = Depends(get_db)):
    s = db.get(Student, student_id)
    if not s:
        raise HTTPException(404, "Student not found")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(s, field, val.upper() if field == "section" else val)
    db.commit()
    return student_out(s, db)
