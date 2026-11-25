import csv
import io
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_roles
from app.core.security import hash_password
from app.models import (AuditLog, Assignment, Course, CourseAssignment, Department, Faculty,
                        FeeRecord, Student, Submission, User)
from app.routers.students import StudentIn, create_student
from app.services import notify

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_roles("admin")


def audit(db: Session, user: User, action: str, entity: str) -> None:
    db.add(AuditLog(user_id=user.id, action=action, entity=entity, timestamp=datetime.now(timezone.utc).replace(tzinfo=None)))


@router.get("/stats")
def stats(user=Depends(admin_only), db: Session = Depends(get_db)):
    return {"students": db.query(Student).count(), "faculty": db.query(Faculty).count(),
            "courses": db.query(Course).count(), "departments": db.query(Department).count(),
            "pending_fee_records": db.query(FeeRecord).filter(FeeRecord.status != "paid").count()}


@router.get("/departments")
def departments(user=Depends(admin_only), db: Session = Depends(get_db)):
    return [{"id": d.id, "name": d.name, "code": d.code} for d in db.query(Department).all()]


class DeptIn(BaseModel):
    name: str
    code: str


@router.post("/departments")
def add_department(body: DeptIn, user=Depends(admin_only), db: Session = Depends(get_db)):
    code = body.code.strip().upper()
    if db.query(Department).filter(Department.code == code).first():
        raise HTTPException(400, f"Department code {code} already exists")
    d = Department(name=body.name, code=code)
    db.add(d)
    audit(db, user, "create", f"department:{body.code}")
    db.commit()
    return {"id": d.id}


@router.get("/courses")
def courses(user=Depends(admin_only), db: Session = Depends(get_db)):
    out = []
    for c in db.query(Course).order_by(Course.semester, Course.code).all():
        fac = (db.query(Faculty.name, CourseAssignment.section)
               .join(CourseAssignment, CourseAssignment.faculty_id == Faculty.id)
               .filter(CourseAssignment.course_id == c.id).all())
        out.append({"id": c.id, "code": c.code, "name": c.name, "semester": c.semester,
                    "credits": c.credits, "dept_id": c.dept_id,
                    "faculty": [{"name": n, "section": s} for n, s in fac]})
    return out


class CourseIn(BaseModel):
    code: str
    name: str
    dept_id: int
    semester: int
    credits: int = 3


@router.post("/courses")
def add_course(body: CourseIn, user=Depends(admin_only), db: Session = Depends(get_db)):
    if db.query(Course).filter(Course.code == body.code).first():
        raise HTTPException(400, "Course code already exists")
    c = Course(**body.model_dump())
    db.add(c)
    audit(db, user, "create", f"course:{body.code}")
    db.commit()
    return {"id": c.id}


class AssignIn(BaseModel):
    course_id: int
    faculty_id: int
    section: str


@router.post("/course-assignments")
def assign_faculty(body: AssignIn, user=Depends(admin_only), db: Session = Depends(get_db)):
    db.add(CourseAssignment(course_id=body.course_id, faculty_id=body.faculty_id,
                            section=body.section.upper()))
    audit(db, user, "assign_faculty", f"course:{body.course_id}")
    db.commit()
    return {"ok": True}


@router.get("/faculty")
def list_faculty(user=Depends(admin_only), db: Session = Depends(get_db)):
    out = []
    for f in db.query(Faculty).order_by(Faculty.faculty_id).all():
        u = db.get(User, f.user_id)
        out.append({"id": f.id, "user_id": u.id, "faculty_id": f.faculty_id, "name": f.name,
                    "email": u.email, "designation": f.designation, "dept_id": f.dept_id,
                    "is_active": u.is_active})
    return out


class FacultyIn(BaseModel):
    faculty_id: str
    name: str
    dept_id: int
    designation: str
    password: str
    email: str | None = None
    phone: str | None = None


def create_faculty_row(db: Session, body: FacultyIn) -> Faculty:
    fid = body.faculty_id.strip().upper()
    if db.query(User).filter(User.login_id == fid).first():
        raise HTTPException(400, f"{fid} already exists")
    email = (body.email or f"{body.name.split()[-1].lower()}.{fid.lower()}@sit-demo.edu.in").lower()
    u = User(login_id=fid, email=email, password_hash=hash_password(body.password), role="faculty")
    db.add(u)
    db.flush()
    f = Faculty(user_id=u.id, faculty_id=fid, name=body.name, dept_id=body.dept_id,
                designation=body.designation, phone=body.phone)
    db.add(f)
    return f


@router.post("/faculty")
def add_faculty(body: FacultyIn, user=Depends(admin_only), db: Session = Depends(get_db)):
    f = create_faculty_row(db, body)
    audit(db, user, "create", f"faculty:{body.faculty_id}")
    db.commit()
    return {"id": f.id}


class ResetIn(BaseModel):
    password: str


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, body: ResetIn, user=Depends(admin_only), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    target.password_hash = hash_password(body.password)
    audit(db, user, "reset_password", f"user:{target.login_id}")
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/toggle-active")
def toggle_active(user_id: int, user=Depends(admin_only), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == user.id:
        raise HTTPException(400, "You cannot deactivate your own account")
    target.is_active = not target.is_active
    audit(db, user, "activate" if target.is_active else "deactivate", f"user:{target.login_id}")
    db.commit()
    return {"is_active": target.is_active}


@router.get("/audit")
def audit_log(user=Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(200).all()
    return [{"user_id": r.user_id, "action": r.action, "entity": r.entity,
             "timestamp": r.timestamp.isoformat()} for r in rows]


@router.post("/import")
async def bulk_import(kind: str, file: UploadFile = File(...), user=Depends(admin_only),
                      db: Session = Depends(get_db)):
    """CSV import. kind=students: usn,name,dept_code,semester,section,batch_year,password[,email,phone]
    kind=faculty: faculty_id,name,dept_code,designation,password[,email,phone]"""
    text = (await file.read()).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    depts = {d.code: d.id for d in db.query(Department).all()}
    created, errors = 0, []
    for line_no, row in enumerate(reader, start=2):
        try:
            dept_id = depts[row["dept_code"].strip().upper()]
            if kind == "students":
                create_student(StudentIn(usn=row["usn"], name=row["name"], dept_id=dept_id,
                                         semester=int(row["semester"]), section=row["section"],
                                         batch_year=int(row["batch_year"]), password=row["password"],
                                         email=row.get("email") or None, phone=row.get("phone") or None),
                               user, db)
            elif kind == "faculty":
                create_faculty_row(db, FacultyIn(faculty_id=row["faculty_id"], name=row["name"],
                                                 dept_id=dept_id, designation=row["designation"],
                                                 password=row["password"], email=row.get("email") or None,
                                                 phone=row.get("phone") or None))
                db.commit()
            else:
                raise HTTPException(400, "kind must be students or faculty")
            created += 1
        except HTTPException as e:
            db.rollback()
            errors.append(f"line {line_no}: {e.detail}")
        except Exception as e:
            db.rollback()
            errors.append(f"line {line_no}: {e}")
    audit(db, user, f"import_{kind}", f"rows:{created}")
    db.commit()
    return {"created": created, "errors": errors}


@router.get("/export/students.csv")
def export_students(user=Depends(admin_only), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["usn", "name", "dept", "semester", "section", "batch_year", "email", "phone"])
    for s in db.query(Student).order_by(Student.usn).all():
        dept = db.get(Department, s.dept_id)
        w.writerow([s.usn, s.name, dept.code, s.semester, s.section, s.batch_year,
                    db.get(User, s.user_id).email, s.phone or ""])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="students.csv"'})


@router.post("/reminders/run")
def run_reminders(user=Depends(admin_only), db: Session = Depends(get_db)):
    """Creates deadline and fee-due notifications. Run daily (cron or manually)."""
    now = datetime.now()
    created = 0
    for a in db.query(Assignment).filter(Assignment.deadline > now,
                                         Assignment.deadline < now + timedelta(hours=48)).all():
        c = db.get(Course, a.course_id)
        notify.create(db, title=f"Deadline soon: {a.title}",
                      body=f"{c.name} - due {a.deadline:%d %b %Y %H:%M}", type_="deadline",
                      scope=f"course:{c.code}", created_by=user.id,
                      user_ids=notify.course_student_user_ids(db, a.course_id))
        created += 1
    for rec in db.query(FeeRecord).filter(FeeRecord.status.in_(["pending", "partial", "overdue"])).all():
        if rec.amount_paid >= rec.amount_due:
            continue
        s = db.get(Student, rec.student_id)
        notify.create(db, title="Fee due", body=f"Balance of Rs. {rec.amount_due - rec.amount_paid:,.2f} is pending.",
                      type_="fee", scope="individual", created_by=user.id, user_ids=[s.user_id])
        created += 1
    return {"notifications_created": created}
