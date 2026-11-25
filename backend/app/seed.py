"""Seed the database from seed_data/FAKE_DATA.md.

Run: python -m app.seed            (skips if already seeded)
     python -m app.seed --reset    (wipes all tables first)
"""
import os
import random
import re
import sys
from datetime import date, datetime, timedelta

from app.core.security import hash_password
from app.models import (Attendance, Base, Course, CourseAssignment, Department, Enrollment,
                        Exam, Faculty, FeeRecord, FeeStructure, Material, Mark, Notification,
                        NotificationRecipient, SessionLocal, Student, TimetableSlot, User, engine,
                        Assignment)
from app.services.enrollment import enroll_student
from app.services import notify
from app.services.results import compute

random.seed(42)
DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "seed_data", "FAKE_DATA.md")
DEPT_CODES = {"CS": "CSE", "EC": "ECE", "ME": "ME"}
SUBJECT_CREDITS = 4
DEPT_NAMES = {"CSE": "Computer Science & Engineering", "ECE": "Electronics & Communication",
              "ME": "Mechanical Engineering"}
SEMESTERS = [2, 4, 6, 8]
PERIODS = 4


def parse_rows(text: str, prefix: str) -> list[list[str]]:
    rows = []
    for line in text.splitlines():
        if line.startswith(f"| {prefix}"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            rows.append(cells)
    return rows


def parse_faculty(text):
    out = []
    for c in parse_rows(text, "FAC"):
        out.append({"faculty_id": c[0], "name": c[1], "dept": c[2], "designation": c[3],
                    "subject": c[4], "email": c[5], "password": c[6], "phone": c[7]})
    return out


def parse_students(text):
    out = []
    for c in parse_rows(text, "1SI"):
        out.append({"usn": c[0], "name": c[1], "gender": c[2], "sem": int(c[3]), "sec": c[4],
                    "email": c[5], "password": c[6], "dob": c[7], "phone": c[8],
                    "guardian": c[9], "guardian_phone": c[10]})
    return out


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def is_seeded(db) -> bool:
    return db.query(User).filter(User.login_id == "ADMIN01").first() is not None


def seed(reset: bool = False):
    if reset:
        reset_db()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if is_seeded(db) and not reset:
        print("Already seeded. Use --reset to rebuild.")
        db.close()
        return

    text = open(DATA_FILE, encoding="utf-8").read()
    faculty_rows = parse_faculty(text)
    student_rows = parse_students(text)

    # Admin
    admin = User(login_id="ADMIN01", email="admin@sit-demo.edu.in",
                 password_hash=hash_password("Admin@2026"), role="admin")
    db.add(admin)

    # Departments
    dept_by_code = {}
    for code, name in DEPT_NAMES.items():
        d = Department(name=name, code=code)
        db.add(d)
        db.flush()
        dept_by_code[code] = d.id

    # Faculty
    fac_by_subject = {}
    for f in faculty_rows:
        u = User(login_id=f["faculty_id"], email=f["email"].lower(),
                 password_hash=hash_password(f["password"]), role="faculty")
        db.add(u)
        db.flush()
        fr = Faculty(user_id=u.id, faculty_id=f["faculty_id"], name=f["name"],
                     dept_id=dept_by_code[f["dept"]], designation=f["designation"], phone=f["phone"])
        db.add(fr)
        db.flush()
        fac_by_subject[(f["dept"], f["subject"])] = fr

    # Courses: each dept's 5 subjects per semester, with the faculty teaching it.
    subjects_by_dept = {}
    for f in faculty_rows:
        subjects_by_dept.setdefault(f["dept"], []).append(f["subject"])
    course_by_key = {}
    for dept, subjects in subjects_by_dept.items():
        for sem in SEMESTERS:
            for i, subj in enumerate(subjects, start=1):
                code = f"{dept}{sem}{i:02d}"
                c = Course(code=code, name=subj, dept_id=dept_by_code[dept], semester=sem,
                           credits=SUBJECT_CREDITS)
                db.add(c)
                db.flush()
                course_by_key[(dept, sem, subj)] = c
                for sec in ("A", "B"):
                    db.add(CourseAssignment(course_id=c.id,
                                            faculty_id=fac_by_subject[(dept, subj)].id,
                                            section=sec))
    db.flush()

    # Students
    students = []
    for s in student_rows:
        dept_code = DEPT_CODES[s["usn"][5:7]]
        u = User(login_id=s["usn"], email=s["email"].lower(),
                 password_hash=hash_password(s["password"]), role="student")
        db.add(u)
        db.flush()
        dob = datetime.strptime(s["dob"], "%d-%m-%Y").date()
        st = Student(user_id=u.id, usn=s["usn"], name=s["name"], dept_id=dept_by_code[dept_code],
                     semester=s["sem"], section=s["sec"], batch_year=2000 + int(s["usn"][3:5]),
                     dob=dob, gender=s["gender"], phone=s["phone"],
                     address="Demo address, Bengaluru", blood_group=random.choice(["A+", "B+", "O+", "AB+"]),
                     guardian_name=s["guardian"], guardian_phone=s["guardian_phone"])
        db.add(st)
        db.flush()
        enroll_student(db, st)
        students.append(st)
    db.flush()

    today = date.today()
    days = [today - timedelta(days=i) for i in range(60, 0, -1) if (today - timedelta(days=i)).weekday() < 5]
    enrollments = db.query(Enrollment).all()
    for en in enrollments:
        for d in days:
            status = "P" if random.random() < 0.85 else "A"
            db.add(Attendance(student_id=en.student_id, course_id=en.course_id, date=d, status=status))

    # Marks, published for past semesters only.
    for en in enrollments:
        st = db.get(Student, en.student_id)
        c = db.get(Course, en.course_id)
        m = Mark(student_id=st.id, course_id=c.id,
                 ia1=random.randint(18, 50), ia2=random.randint(18, 50), ia3=random.randint(18, 50),
                 assignment=random.randint(5, 10), lab=random.randint(5, 10),
                 see=random.randint(35, 100), published=(st.semester < 8))
        db.add(m)
        db.flush()
        m.grade = compute(m)["grade"]

    # Timetable and exams per dept/sem/section.
    for dept_code, subjects in subjects_by_dept.items():
        for sem in SEMESTERS:
            for sec in ("A", "B"):
                for idx, subj in enumerate(subjects):
                    c = course_by_key[(dept_code, sem, subj)]
                    day = idx % 6 + 1
                    period = idx % PERIODS + 1
                    db.add(TimetableSlot(dept_id=dept_by_code[dept_code], semester=sem, section=sec,
                                         day=day, period=period, course_id=c.id,
                                         room=f"{dept_code}-{100 + idx}"))
                    for typ, offset in (("IA1", 20), ("IA2", 50), ("IA3", 80)):
                        if sec == "A":
                            db.add(Exam(course_id=c.id, type=typ, date=today + timedelta(days=offset + idx),
                                        time="10:00", room=f"{dept_code}-{100 + idx}"))

    # Study materials and assignments with some submissions.
    for (dept_code, sem, subj), c in course_by_key.items():
        if sem != 8:
            db.add(Material(course_id=c.id, unit="Unit 1", title=f"{subj} - Notes",
                            type="notes", file_path_or_url="https://example.com/notes",
                            uploaded_by=admin.id))
            db.add(Material(course_id=c.id, unit="Unit 2", title=f"{subj} - Question paper 2025",
                            type="question_paper", file_path_or_url="https://example.com/qp",
                            uploaded_by=admin.id))
        a = Assignment(course_id=c.id, title=f"{subj} - Assignment 1",
                       description="Solve the problems in the handout.",
                       deadline=datetime.now() + timedelta(days=random.randint(-10, 14)),
                       max_marks=10)
        db.add(a)

    # Fee structures and records.
    for dept_code, dept_id in dept_by_code.items():
        for sem in SEMESTERS:
            for fee_type, amount in (("Tuition", 75000), ("Exam", 2500), ("Library", 1000)):
                db.add(FeeStructure(dept_id=dept_id, semester=sem, fee_type=fee_type,
                                    amount=amount, due_date=today + timedelta(days=random.randint(-30, 30))))
    db.flush()
    for st in students:
        for fs in db.query(FeeStructure).filter(FeeStructure.dept_id == st.dept_id,
                                                FeeStructure.semester == st.semester).all():
            roll = random.random()
            paid = fs.amount if roll < 0.5 else (round(fs.amount * 0.5, 2) if roll < 0.7 else 0)
            status = "paid" if paid >= fs.amount else ("partial" if paid > 0 else "pending")
            db.add(FeeRecord(student_id=st.id, fee_structure_id=fs.id, amount_due=fs.amount,
                             amount_paid=paid, status=status))

    # Sample notices
    note = notify.create(db, title="Welcome to the new academic year",
                         body="Please check your timetable and fee dues.",
                         type_="notice", scope="all", created_by=admin.id,
                         user_ids=notify.all_student_user_ids(db))

    db.commit()
    db.close()
    print(f"Seeded: 1 admin, {len(faculty_rows)} faculty, {len(student_rows)} students.")
    print("Logins: ADMIN01 / Admin@2026  |  faculty IDs and student USNs from FAKE_DATA.md")


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
