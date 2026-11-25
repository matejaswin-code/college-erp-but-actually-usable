import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.core.deps import current_user, get_db, require_roles
from app.models import Assignment, Course, Enrollment, Material, Student, Submission, User
from app.routers.academics import faculty_owns_course, my_student
from app.services import notify
from app.services.files import absolute, save_upload

router = APIRouter(tags=["coursework"])


def assignment_out(a: Assignment, db: Session, student: Student | None = None) -> dict:
    c = db.get(Course, a.course_id)
    out = {"id": a.id, "course": c.name, "course_id": a.course_id, "title": a.title,
           "description": a.description, "deadline": a.deadline.isoformat(),
           "max_marks": a.max_marks, "has_file": bool(a.file_path),
           "overdue": datetime.now() > a.deadline}
    if student:
        sub = db.query(Submission).filter(Submission.assignment_id == a.id,
                                          Submission.student_id == student.id).first()
        out["my_submission"] = None if not sub else {
            "id": sub.id, "submitted_at": sub.submitted_at.isoformat(), "is_late": sub.is_late,
            "marks": sub.marks, "feedback": sub.feedback}
    return out


@router.post("/assignments")
async def create_assignment(course_id: int = Form(...), title: str = Form(...),
                            deadline: str = Form(...), max_marks: float = Form(10),
                            description: str = Form(""), file: UploadFile | None = File(None),
                            user=Depends(require_roles("faculty", "admin")),
                            db: Session = Depends(get_db)):
    faculty_owns_course(db, user, course_id)
    try:
        dl = datetime.fromisoformat(deadline)
    except ValueError:
        raise HTTPException(400, "deadline must be ISO format, e.g. 2026-12-01T17:00")
    path = await save_upload(file, "assignments") if file and file.filename else None
    a = Assignment(course_id=course_id, title=title, description=description,
                   deadline=dl, max_marks=max_marks, file_path=path)
    db.add(a)
    db.commit()
    course = db.get(Course, course_id)
    notify.create(db, title=f"New assignment: {title}",
                  body=f"{course.name} - due {dl:%d %b %Y %H:%M}", type_="assignment",
                  scope=f"course:{course.code}", created_by=user.id,
                  user_ids=notify.course_student_user_ids(db, course_id))
    return assignment_out(a, db)


@router.get("/assignments")
def list_assignments(user=Depends(current_user), db: Session = Depends(get_db)):
    if user.role == "student":
        s = my_student(db, user)
        course_ids = [e.course_id for e in db.query(Enrollment).filter(Enrollment.student_id == s.id)]
        rows = db.query(Assignment).filter(Assignment.course_id.in_(course_ids)) \
                 .order_by(Assignment.deadline).all()
        return [assignment_out(a, db, s) for a in rows]
    rows = db.query(Assignment).order_by(Assignment.deadline).all()
    return [assignment_out(a, db) for a in rows]


@router.post("/assignments/{assignment_id}/submit")
async def submit(assignment_id: int, file: UploadFile = File(...),
                 user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    enrolled = db.query(Enrollment).filter(Enrollment.student_id == s.id,
                                           Enrollment.course_id == a.course_id).first()
    if not enrolled:
        raise HTTPException(403, "You are not enrolled in this course")
    path = await save_upload(file, "submissions")
    sub = db.query(Submission).filter(Submission.assignment_id == a.id,
                                      Submission.student_id == s.id).first()
    now = datetime.now()
    if not sub:
        sub = Submission(assignment_id=a.id, student_id=s.id)
        db.add(sub)
    sub.file_path = path
    sub.submitted_at = now
    sub.is_late = now > a.deadline
    db.commit()
    return {"id": sub.id, "is_late": sub.is_late}


@router.get("/assignments/{assignment_id}/submissions")
def list_submissions(assignment_id: int, user=Depends(require_roles("faculty", "admin")),
                     db: Session = Depends(get_db)):
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    faculty_owns_course(db, user, a.course_id)
    out = []
    for sub in db.query(Submission).filter(Submission.assignment_id == a.id).all():
        st = db.get(Student, sub.student_id)
        out.append({"id": sub.id, "usn": st.usn, "name": st.name,
                    "submitted_at": sub.submitted_at.isoformat(), "is_late": sub.is_late,
                    "marks": sub.marks, "feedback": sub.feedback})
    return out


@router.post("/submissions/{submission_id}/grade")
def grade(submission_id: int, marks: float = Form(...), feedback: str = Form(""),
          user=Depends(require_roles("faculty", "admin")), db: Session = Depends(get_db)):
    sub = db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    a = db.get(Assignment, sub.assignment_id)
    faculty_owns_course(db, user, a.course_id)
    if not (0 <= marks <= a.max_marks):
        raise HTTPException(400, f"Marks must be between 0 and {a.max_marks}")
    sub.marks = marks
    sub.feedback = feedback
    db.commit()
    st = db.get(Student, sub.student_id)
    notify.create(db, title=f"Graded: {a.title}", body=f"You scored {marks}/{a.max_marks}.",
                  type_="grade", scope="individual", created_by=user.id, user_ids=[st.user_id])
    return {"ok": True}


# ---------- Study materials ----------
@router.post("/materials")
async def upload_material(course_id: int = Form(...), unit: str = Form(...), title: str = Form(...),
                          type: str = Form("notes"), url: str = Form(""),
                          file: UploadFile | None = File(None),
                          user=Depends(require_roles("faculty", "admin")),
                          db: Session = Depends(get_db)):
    faculty_owns_course(db, user, course_id)
    if file and file.filename:
        ref = await save_upload(file, "materials")
    elif url:
        ref = url
    else:
        raise HTTPException(400, "Provide a file or a link")
    m = Material(course_id=course_id, unit=unit, title=title, type=type,
                 file_path_or_url=ref, uploaded_by=user.id)
    db.add(m)
    db.commit()
    return {"id": m.id}


@router.get("/materials")
def list_materials(course_id: int, q: str | None = None, user=Depends(current_user),
                   db: Session = Depends(get_db)):
    if user.role == "student":
        s = my_student(db, user)
        ok = db.query(Enrollment).filter(Enrollment.student_id == s.id,
                                         Enrollment.course_id == course_id).first()
        if not ok:
            raise HTTPException(403, "Not enrolled in this course")
    query = db.query(Material).filter(Material.course_id == course_id)
    if q:
        query = query.filter(Material.title.ilike(f"%{q}%"))
    return [{"id": m.id, "unit": m.unit, "title": m.title, "type": m.type,
             "is_link": m.file_path_or_url.startswith("http")}
            for m in query.order_by(Material.unit, Material.title).all()]


@router.get("/downloads/material/{material_id}")
def download_material(material_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    m = db.get(Material, material_id)
    if not m:
        raise HTTPException(404, "Not found")
    if user.role == "student":
        s = my_student(db, user)
        if not db.query(Enrollment).filter(Enrollment.student_id == s.id,
                                           Enrollment.course_id == m.course_id).first():
            raise HTTPException(403, "Not enrolled")
    if m.file_path_or_url.startswith("http"):
        return RedirectResponse(m.file_path_or_url)
    return FileResponse(absolute(m.file_path_or_url), filename=os.path.basename(m.file_path_or_url))


@router.get("/downloads/assignment/{assignment_id}")
def download_assignment(assignment_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(Assignment, assignment_id)
    if not a or not a.file_path:
        raise HTTPException(404, "No file")
    if user.role == "student":
        s = my_student(db, user)
        if not db.query(Enrollment).filter(Enrollment.student_id == s.id,
                                           Enrollment.course_id == a.course_id).first():
            raise HTTPException(403, "Not enrolled")
    return FileResponse(absolute(a.file_path), filename=os.path.basename(a.file_path))


@router.get("/downloads/submission/{submission_id}")
def download_submission(submission_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    sub = db.get(Submission, submission_id)
    if not sub:
        raise HTTPException(404, "Not found")
    if user.role == "student":
        if my_student(db, user).id != sub.student_id:
            raise HTTPException(403, "Not your submission")
    elif user.role == "faculty":
        faculty_owns_course(db, user, db.get(Assignment, sub.assignment_id).course_id)
    return FileResponse(absolute(sub.file_path), filename=os.path.basename(sub.file_path))
