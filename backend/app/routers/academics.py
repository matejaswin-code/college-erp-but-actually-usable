from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import current_user, get_db, require_roles
from app.models import (Attendance, Course, CourseAssignment, Enrollment, Exam, Faculty,
                        Mark, Student, TimetableSlot, User)
from app.services import notify, results

router = APIRouter(tags=["academics"])

FIELDS = ("ia1", "ia2", "ia3", "assignment", "lab", "see")


def my_student(db: Session, user: User) -> Student:
    s = db.query(Student).filter(Student.user_id == user.id).first()
    if not s:
        raise HTTPException(404, "Student profile not found")
    return s


def my_faculty(db: Session, user: User) -> Faculty:
    f = db.query(Faculty).filter(Faculty.user_id == user.id).first()
    if not f:
        raise HTTPException(404, "Faculty profile not found")
    return f


def faculty_owns_course(db: Session, user: User, course_id: int) -> None:
    if user.role == "admin":
        return
    f = my_faculty(db, user)
    ok = db.query(CourseAssignment).filter(CourseAssignment.course_id == course_id,
                                           CourseAssignment.faculty_id == f.id).first()
    if not ok:
        raise HTTPException(403, "You are not assigned to this course")


def course_out(c: Course, db: Session) -> dict:
    return {"id": c.id, "code": c.code, "name": c.name, "semester": c.semester,
            "credits": c.credits, "dept_id": c.dept_id}


@router.get("/courses/me")
def my_courses(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "student":
        s = my_student(db, user)
        rows = (db.query(Course).join(Enrollment, Enrollment.course_id == Course.id)
                .filter(Enrollment.student_id == s.id).all())
    elif user.role == "faculty":
        f = my_faculty(db, user)
        rows = (db.query(Course).join(CourseAssignment, CourseAssignment.course_id == Course.id)
                .filter(CourseAssignment.faculty_id == f.id).distinct().all())
    else:
        rows = db.query(Course).all()
    return [course_out(c, db) for c in rows]


@router.get("/courses/{course_id}/students")
def course_students(course_id: int, user=Depends(require_roles("faculty", "admin")),
                    db: Session = Depends(get_db)):
    faculty_owns_course(db, user, course_id)
    rows = (db.query(Student).join(Enrollment, Enrollment.student_id == Student.id)
            .filter(Enrollment.course_id == course_id).order_by(Student.usn).all())
    return [{"id": s.id, "usn": s.usn, "name": s.name, "section": s.section} for s in rows]


# ---------- Attendance ----------
class AttendanceRecord(BaseModel):
    student_id: int
    status: str  # P or A


class AttendanceIn(BaseModel):
    course_id: int
    date: date
    records: list[AttendanceRecord]


@router.post("/attendance")
def mark_attendance(body: AttendanceIn, user=Depends(require_roles("faculty", "admin")),
                    db: Session = Depends(get_db)):
    faculty_owns_course(db, user, body.course_id)
    if body.date > date.today():
        raise HTTPException(400, "Cannot mark attendance for a future date")
    for rec in body.records:
        status = rec.status.upper()
        if status not in ("P", "A"):
            raise HTTPException(400, "Status must be P or A")
        row = (db.query(Attendance).filter(Attendance.student_id == rec.student_id,
                                           Attendance.course_id == body.course_id,
                                           Attendance.date == body.date).first())
        if row:
            row.status = status
        else:
            db.add(Attendance(student_id=rec.student_id, course_id=body.course_id,
                              date=body.date, status=status))
    db.commit()
    return {"saved": len(body.records)}


@router.get("/attendance/course/{course_id}")
def attendance_for_day(course_id: int, on: date, user=Depends(require_roles("faculty", "admin")),
                       db: Session = Depends(get_db)):
    faculty_owns_course(db, user, course_id)
    rows = db.query(Attendance).filter(Attendance.course_id == course_id,
                                       Attendance.date == on).all()
    return [{"student_id": r.student_id, "status": r.status} for r in rows]


@router.get("/attendance/me")
def my_attendance(user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    out, total_all, present_all = [], 0, 0
    for c in (db.query(Course).join(Enrollment, Enrollment.course_id == Course.id)
              .filter(Enrollment.student_id == s.id).all()):
        recs = db.query(Attendance).filter(Attendance.student_id == s.id,
                                           Attendance.course_id == c.id).order_by(Attendance.date).all()
        total = len(recs)
        present = sum(1 for r in recs if r.status == "P")
        pct = round(present * 100 / total, 1) if total else None
        total_all += total
        present_all += present
        out.append({"course": c.name, "code": c.code, "present": present, "total": total,
                    "percent": pct, "warning": pct is not None and pct < 75,
                    "log": [{"date": r.date.isoformat(), "status": r.status} for r in recs]})
    overall = round(present_all * 100 / total_all, 1) if total_all else None
    return {"overall_percent": overall, "courses": out}


# ---------- Marks and results ----------
class MarkIn(BaseModel):
    course_id: int
    student_id: int
    ia1: float | None = None
    ia2: float | None = None
    ia3: float | None = None
    assignment: float | None = None
    lab: float | None = None
    see: float | None = None


@router.post("/marks")
def enter_marks(body: MarkIn, user=Depends(require_roles("faculty", "admin")),
                db: Session = Depends(get_db)):
    faculty_owns_course(db, user, body.course_id)
    limits = {"ia1": 50, "ia2": 50, "ia3": 50, "assignment": 10, "lab": 10, "see": 100}
    m = (db.query(Mark).filter(Mark.student_id == body.student_id,
                               Mark.course_id == body.course_id).first())
    if not m:
        m = Mark(student_id=body.student_id, course_id=body.course_id)
        db.add(m)
    for field in FIELDS:
        val = getattr(body, field)
        if val is None:
            continue
        if not (0 <= val <= limits[field]):
            raise HTTPException(400, f"{field} must be between 0 and {limits[field]}")
        setattr(m, field, val)
    db.flush()
    m.grade = results.compute(m)["grade"]
    db.commit()
    return results.compute(m) | {"published": m.published}


@router.post("/marks/publish")
def publish_marks(course_id: int, user=Depends(require_roles("faculty", "admin")),
                  db: Session = Depends(get_db)):
    faculty_owns_course(db, user, course_id)
    marks = db.query(Mark).filter(Mark.course_id == course_id).all()
    for m in marks:
        m.published = True
    db.commit()
    course = db.get(Course, course_id)
    student_ids = [m.student_id for m in marks]
    uids = [r[0] for r in db.query(Student.user_id).filter(Student.id.in_(student_ids)).all()]
    notify.create(db, title=f"Marks published: {course.name}",
                  body="Your marks for this subject are now available.", type_="marks",
                  scope=f"course:{course.code}", created_by=user.id, user_ids=uids)
    return {"published": len(marks)}


@router.get("/marks/course/{course_id}")
def course_marks(course_id: int, user=Depends(require_roles("faculty", "admin")),
                 db: Session = Depends(get_db)):
    faculty_owns_course(db, user, course_id)
    out = []
    for m in db.query(Mark).filter(Mark.course_id == course_id).all():
        st = db.get(Student, m.student_id)
        out.append({"student_id": m.student_id, "usn": st.usn, "name": st.name,
                    **{f: getattr(m, f) for f in FIELDS}, "published": m.published,
                    **results.compute(m)})
    return out


@router.get("/marks/me")
def my_marks(user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    out = []
    for m in db.query(Mark).filter(Mark.student_id == s.id, Mark.published.is_(True)).all():
        c = db.get(Course, m.course_id)
        out.append({"course": c.name, "code": c.code, "credits": c.credits,
                    **{f: getattr(m, f) for f in FIELDS}, **results.compute(m)})
    return out


@router.get("/results/me")
def my_results(user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    by_sem: dict[int, list[tuple[int, int]]] = {}
    for m in db.query(Mark).filter(Mark.student_id == s.id, Mark.published.is_(True)).all():
        c = db.get(Course, m.course_id)
        by_sem.setdefault(c.semester, []).append((c.credits, results.compute(m)["grade_points"]))
    sems = [{"semester": sem, "sgpa": results.sgpa(rows)} for sem, rows in sorted(by_sem.items())]
    all_rows = [r for rows in by_sem.values() for r in rows]
    cgpa = results.sgpa(all_rows) if all_rows else None
    return {"semesters": sems, "cgpa": cgpa}


# ---------- Timetable and exams ----------
@router.get("/timetable")
def timetable(dept_id: int | None = None, semester: int | None = None, section: str | None = None,
              user=Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "student":
        s = my_student(db, user)
        dept_id, semester, section = s.dept_id, s.semester, s.section
    q = db.query(TimetableSlot)
    if dept_id:
        q = q.filter(TimetableSlot.dept_id == dept_id)
    if semester:
        q = q.filter(TimetableSlot.semester == semester)
    if section:
        q = q.filter(TimetableSlot.section == section.upper())
    out = []
    for t in q.order_by(TimetableSlot.day, TimetableSlot.period).all():
        c = db.get(Course, t.course_id)
        out.append({"day": t.day, "period": t.period, "course": c.name, "room": t.room,
                    "section": t.section, "semester": t.semester})
    return out


@router.get("/exams/me")
def my_exams(user=Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "student":
        s = my_student(db, user)
        course_ids = [e.course_id for e in db.query(Enrollment).filter(Enrollment.student_id == s.id)]
    elif user.role == "faculty":
        f = my_faculty(db, user)
        course_ids = [a.course_id for a in db.query(CourseAssignment)
                      .filter(CourseAssignment.faculty_id == f.id)]
    else:
        course_ids = [c.id for c in db.query(Course).all()]
    out = []
    for e in db.query(Exam).filter(Exam.course_id.in_(course_ids)).order_by(Exam.date).all():
        c = db.get(Course, e.course_id)
        out.append({"course": c.name, "type": e.type, "date": e.date.isoformat(),
                    "time": e.time, "room": e.room})
    return out
