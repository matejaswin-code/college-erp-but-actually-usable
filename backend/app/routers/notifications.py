from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import current_user, get_db, require_roles
from app.models import Course, CourseAssignment, Faculty, Notification, NotificationRecipient, Student, User
from app.services import notify

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/me")
def my_notifications(type: str | None = None, user=Depends(current_user), db: Session = Depends(get_db)):
    q = (db.query(NotificationRecipient, Notification)
         .join(Notification, Notification.id == NotificationRecipient.notification_id)
         .filter(NotificationRecipient.user_id == user.id))
    if type:
        q = q.filter(Notification.type == type)
    rows = q.order_by(Notification.created_at.desc()).limit(200).all()
    items = [{"id": r.id, "title": n.title, "body": n.body, "type": n.type,
              "created_at": n.created_at.isoformat(), "is_read": r.is_read} for r, n in rows]
    unread = sum(1 for i in items if not i["is_read"])
    return {"unread": unread, "items": items}


@router.post("/{recipient_id}/read")
def mark_read(recipient_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    r = db.get(NotificationRecipient, recipient_id)
    if not r or r.user_id != user.id:
        raise HTTPException(404, "Not found")
    r.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def read_all(user=Depends(current_user), db: Session = Depends(get_db)):
    db.query(NotificationRecipient).filter(NotificationRecipient.user_id == user.id,
                                           NotificationRecipient.is_read.is_(False)) \
      .update({"is_read": True})
    db.commit()
    return {"ok": True}


class NoticeIn(BaseModel):
    title: str
    body: str
    scope: str  # all | dept | semester | section | course | individuals
    dept_id: int | None = None
    semester: int | None = None
    section: str | None = None
    course_id: int | None = None
    usns: list[str] | None = None


@router.post("")
def send_notice(body: NoticeIn, user=Depends(require_roles("faculty", "admin")),
                db: Session = Depends(get_db)):
    sq = db.query(Student)
    if user.role == "faculty":
        if body.scope != "course" or not body.course_id:
            raise HTTPException(403, "Faculty can only send notices to their own course")
        f = db.query(Faculty).filter(Faculty.user_id == user.id).first()
        assigned = db.query(CourseAssignment).filter(CourseAssignment.course_id == body.course_id,
                                                     CourseAssignment.faculty_id == f.id).first()
        if not assigned:
            raise HTTPException(403, "Not your course")
        uids = notify.course_student_user_ids(db, body.course_id)
        scope = f"course:{body.course_id}"
    else:
        if body.scope == "all":
            uids = notify.all_student_user_ids(db)
        elif body.scope == "course" and body.course_id:
            uids = notify.course_student_user_ids(db, body.course_id)
        else:
            if body.scope == "dept" and body.dept_id:
                sq = sq.filter(Student.dept_id == body.dept_id)
            if body.scope in ("semester", "dept", "section") and body.semester:
                sq = sq.filter(Student.semester == body.semester)
            if body.scope == "section" and body.section:
                sq = sq.filter(Student.section == body.section.upper())
            if body.scope == "individuals":
                sq = sq.filter(Student.usn.in_([u.strip().upper() for u in body.usns or []]))
            uids = [s.user_id for s in sq.all()]
        scope = body.scope
    if not uids:
        raise HTTPException(400, "No students matched this audience")
    note = notify.create(db, title=body.title, body=body.body, type_="notice", scope=scope,
                         created_by=user.id, user_ids=uids)
    return {"id": note.id, "recipients": len(set(uids))}
