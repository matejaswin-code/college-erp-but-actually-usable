from sqlalchemy.orm import Session

from app.models import Course, Enrollment, Student


def enroll_student(db: Session, student: Student) -> None:
    """Enroll a student in every course of their dept and semester."""
    courses = db.query(Course).filter(Course.dept_id == student.dept_id,
                                      Course.semester == student.semester).all()
    existing = {e.course_id for e in db.query(Enrollment).filter(Enrollment.student_id == student.id)}
    for c in courses:
        if c.id not in existing:
            db.add(Enrollment(student_id=student.id, course_id=c.id))
