from sqlalchemy.orm import Session

from app.models import Notification, NotificationRecipient, Student, Enrollment, User


def create(db: Session, *, title: str, body: str, type_: str, scope: str,
           created_by: int, user_ids: list[int]) -> Notification:
    note = Notification(title=title, body=body, type=type_, target_scope=scope,
                        created_by=created_by)
    db.add(note)
    db.flush()
    for uid in sorted(set(user_ids)):
        db.add(NotificationRecipient(notification_id=note.id, user_id=uid))
    db.commit()
    return note


def course_student_user_ids(db: Session, course_id: int) -> list[int]:
    rows = (db.query(Student.user_id).join(Enrollment, Enrollment.student_id == Student.id)
            .filter(Enrollment.course_id == course_id).all())
    return [r[0] for r in rows]


def all_student_user_ids(db: Session) -> list[int]:
    return [r[0] for r in db.query(User.id).filter(User.role == "student", User.is_active.is_(True)).all()]
