from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, now


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    login_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))  # student | faculty | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(10), unique=True)


class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    usn: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    semester: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(2))
    batch_year: Mapped[int] = mapped_column(Integer)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(1), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(5), nullable=True)
    guardian_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    guardian_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Faculty(Base):
    __tablename__ = "faculty"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    faculty_id: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    designation: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    semester: Mapped[int] = mapped_column(Integer)
    credits: Mapped[int] = mapped_column(Integer, default=3)


class CourseAssignment(Base):
    __tablename__ = "course_assignments"
    __table_args__ = (UniqueConstraint("course_id", "faculty_id", "section"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculty.id"))
    section: Mapped[str] = mapped_column(String(2))


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("student_id", "course_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))


class Attendance(Base):
    __tablename__ = "attendance"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), index=True)
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(1))  # P | A


class TimetableSlot(Base):
    __tablename__ = "timetable"
    id: Mapped[int] = mapped_column(primary_key=True)
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    semester: Mapped[int] = mapped_column(Integer)
    section: Mapped[str] = mapped_column(String(2))
    day: Mapped[int] = mapped_column(Integer)  # 1=Mon..6=Sat
    period: Mapped[int] = mapped_column(Integer)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    room: Mapped[str] = mapped_column(String(20))


class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    type: Mapped[str] = mapped_column(String(10))  # IA1 | IA2 | IA3 | SEE
    date: Mapped[date] = mapped_column(Date)
    time: Mapped[str] = mapped_column(String(10))
    room: Mapped[str] = mapped_column(String(20))


class Mark(Base):
    __tablename__ = "marks"
    __table_args__ = (UniqueConstraint("student_id", "course_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    ia1: Mapped[float | None] = mapped_column(Float, nullable=True)
    ia2: Mapped[float | None] = mapped_column(Float, nullable=True)
    ia3: Mapped[float | None] = mapped_column(Float, nullable=True)
    assignment: Mapped[float | None] = mapped_column(Float, nullable=True)
    lab: Mapped[float | None] = mapped_column(Float, nullable=True)
    see: Mapped[float | None] = mapped_column(Float, nullable=True)
    grade: Mapped[str | None] = mapped_column(String(3), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False)


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime)
    max_marks: Mapped[float] = mapped_column(Float, default=10)
    file_path: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "student_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"))
    file_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    is_late: Mapped[bool] = mapped_column(Boolean, default=False)
    marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)


class Material(Base):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    unit: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(20))  # notes | ppt | question_paper | video
    file_path_or_url: Mapped[str] = mapped_column(String(500))
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class FeeStructure(Base):
    __tablename__ = "fee_structures"
    id: Mapped[int] = mapped_column(primary_key=True)
    dept_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    semester: Mapped[int] = mapped_column(Integer)
    fee_type: Mapped[str] = mapped_column(String(30))
    amount: Mapped[float] = mapped_column(Float)
    due_date: Mapped[date] = mapped_column(Date)


class FeeRecord(Base):
    __tablename__ = "fee_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    fee_structure_id: Mapped[int] = mapped_column(ForeignKey("fee_structures.id"))
    amount_due: Mapped[float] = mapped_column(Float)
    amount_paid: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(10))  # paid | partial | pending | overdue


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    fee_record_id: Mapped[int] = mapped_column(ForeignKey("fee_records.id"))
    amount: Mapped[float] = mapped_column(Float)
    method: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10))
    txn_id: Mapped[str] = mapped_column(String(40), unique=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(30))
    target_scope: Mapped[str] = mapped_column(String(50))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class NotificationRecipient(Base):
    __tablename__ = "notification_recipients"
    id: Mapped[int] = mapped_column(primary_key=True)
    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    entity: Mapped[str] = mapped_column(String(100))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=now)
