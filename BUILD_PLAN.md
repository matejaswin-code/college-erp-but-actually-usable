# College ERP: Build Plan

Fully built, deployable college ERP with server, database, login, seeded fake data, and student/faculty/admin portals. All tools are free/open-source.

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | FastAPI (Python 3.11+) | Fast, auto API docs, you already use it |
| ORM / Migrations | SQLAlchemy 2 + Alembic | Clean schema versioning |
| Database | PostgreSQL 16 | Relational data, free |
| Auth | JWT in httpOnly cookies, bcrypt, role-based guards | Secure, simple |
| Frontend | React + Vite + Tailwind + React Router | Responsive, mobile friendly |
| File storage | Local volume (`/data/uploads`) | Free, no cloud needed |
| PDF receipts | ReportLab | Free |
| Deploy | Docker Compose (nginx + API + Postgres) | One command up |
| Free hosting options | Render, Fly.io free tier, Oracle Cloud free VM, or self-host | Zero cost |

## 2. Roles

- **Student:** view own data, submit assignments, pay fees, read notices
- **Faculty:** manage own courses (attendance, marks, assignments, materials, notices)
- **Admin:** full control, user management, fees, notices, bulk import

## 3. Features

### 3.1 Authentication
- Login with USN / Faculty ID / email + password
- Role-based redirect after login
- Change password, forgot password (admin reset, no email service)
- Session expiry, logout, rate-limited login attempts

### 3.2 Student Dashboard
- Attendance %, upcoming deadlines, latest notices
- Fee due summary, current SGPA/CGPA
- Quick links to every module

### 3.3 Student Details
- Personal info, USN, branch, semester, section, batch
- Guardian details, address, phone, DOB, blood group
- Profile photo (upload)

### 3.4 Attendance
- Subject-wise percentage and day-wise log
- Warning badge under 75%
- Faculty marks attendance per class (present / absent)

### 3.5 Timetable and Exam Schedule
- Weekly timetable by branch, semester, section
- Internal and semester exam schedule with date, time, room

### 3.6 Marks and Internals
- IA1, IA2, IA3, assignment, lab, and SEE marks per subject
- Best-of-two internals logic, total, grade, grade points
- SGPA / CGPA calculation, semester-wise result card
- Faculty enters marks; students see only after "published"

### 3.7 Assignments
- Faculty creates with title, description, deadline, max marks, attachment
- Student uploads submission; late flag after deadline
- Faculty grades with feedback; student sees grade

### 3.8 Study Materials
- Per course: notes, PPTs, question papers, video links
- Faculty upload; students browse, search, download
- Organized by unit/module

### 3.9 Fees
- Fee structure per branch and semester (tuition, exam, library, hostel, transport)
- Paid / pending / overdue status, due dates
- Payment history and downloadable PDF receipt
- **Mock payment gateway** (see section 6)

### 3.10 Notification Center
- Bell icon with unread badge
- Announcements targeted to: all, branch, semester, section, or individuals
- Auto notifications: new assignment, marks published, fee due, deadline near, payment success
- Mark read / mark all read, filter by type

### 3.11 Faculty Panel
- My courses and students list
- Mark attendance, enter marks, post assignments, upload materials, send notices
- Review and grade submissions

### 3.12 Admin Panel
- CRUD: students, faculty, departments, courses, sections, fee structures
- Assign faculty to courses
- Bulk import via CSV, export reports
- Reset user passwords, activate/deactivate accounts
- Global announcements, audit log

## 4. Database Schema

| Table | Key fields |
|---|---|
| users | id, login_id (USN/FacID), email, password_hash, role, is_active, created_at |
| departments | id, name, code |
| students | id, user_id, usn, name, dept_id, semester, section, batch_year, dob, gender, phone, address, blood_group, guardian_name, guardian_phone, photo_path |
| faculty | id, user_id, faculty_id, name, dept_id, designation, phone |
| courses | id, code, name, dept_id, semester, credits |
| course_assignments | id, course_id, faculty_id, section |
| enrollments | id, student_id, course_id |
| attendance | id, student_id, course_id, date, status |
| timetable | id, dept_id, semester, section, day, period, course_id, room |
| exams | id, course_id, type, date, time, room |
| marks | id, student_id, course_id, ia1, ia2, ia3, assignment, lab, see, grade, published |
| assignments | id, course_id, title, description, deadline, max_marks, file_path |
| submissions | id, assignment_id, student_id, file_path, submitted_at, is_late, marks, feedback |
| materials | id, course_id, unit, title, type, file_path_or_url, uploaded_by, created_at |
| fee_structures | id, dept_id, semester, fee_type, amount, due_date |
| fee_records | id, student_id, fee_structure_id, amount_due, amount_paid, status |
| payments | id, student_id, fee_record_id, amount, method, status, txn_id, paid_at |
| notifications | id, title, body, type, target_scope, created_by, created_at |
| notification_recipients | id, notification_id, user_id, is_read, read_at |
| audit_logs | id, user_id, action, entity, timestamp |

## 5. API Outline

- `POST /auth/login`, `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/me`
- `/students`, `/faculty`, `/courses`, `/departments` (CRUD, admin)
- `/attendance`, `/marks`, `/results/{student}` (SGPA/CGPA)
- `/assignments`, `/assignments/{id}/submit`, `/submissions/{id}/grade`
- `/materials`, `/timetable`, `/exams`
- `/fees`, `/fees/pay`, `/payments`, `/payments/{id}/receipt`
- `/notifications`, `/notifications/{id}/read`, `/notifications/read-all`
- `/admin/import`, `/admin/reset-password`, `/admin/audit`
- Auto docs at `/docs` (Swagger)

## 6. Mock Payment Gateway

Simple, no password or OTP:

1. Student opens Fees, picks a pending fee
2. Chooses **payment method**: UPI, Credit/Debit Card, Net Banking, or Wallet
3. Enters or confirms **amount** (full or partial, not above pending balance)
4. Presses **Pay**
5. Backend simulates processing (short delay), always marks it **Success**, generates a transaction ID (`TXN` + timestamp + random), updates the fee record, creates a payment row
6. Student sees a success screen, a PDF receipt, and a notification is created

An optional dev flag (`MOCK_PAYMENT_FAIL_RATE`) can simulate failures for testing; default is 0.

## 7. Seed Data

- Source of truth: `FAKE_DATA.md` (120 students, 15 faculty, 1 admin)
- 3 departments (CSE, ECE, ME), semesters 2, 4, 6, 8, sections A and B
- USN format `1SI23CS011`; email `firstname.usn@sit-demo.edu.in`; unique fake passwords
- Seed script also generates: courses per semester, enrollments, 60 days of attendance, IA/lab/SEE marks, assignments with some submissions, study material entries, fee structures with a mix of paid / partial / pending, timetable, exam schedule, and sample notifications
- Run with `python -m app.seed` (idempotent, can reset DB)

## 8. Project Structure

```
college-erp/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/        (config, security, deps)
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── routers/
│   │   ├── services/    (results calc, notifications, receipts)
│   │   └── seed.py
│   ├── alembic/
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   ├── src/ (pages, components, api, auth)
│   └── Dockerfile
├── nginx/default.conf
├── docker-compose.yml
├── .env.example
└── README.md
```

## 9. Security

- bcrypt password hashing, httpOnly + SameSite cookies, CORS locked down
- Role checks on every route; students can only read their own records
- Upload validation (type, size limit), sanitized file names
- Login rate limiting, audit log for admin actions
- Secrets via `.env`, never committed

## 10. Build Phases

| Phase | Scope |
|---|---|
| 1 | Repo setup, Docker Compose, DB models, migrations, seed script |
| 2 | Auth, roles, login page, layout and navigation |
| 3 | Student portal: dashboard, profile, attendance, marks, timetable, exams |
| 4 | Assignments, study materials, notification center |
| 5 | Fees and mock payment, PDF receipts |
| 6 | Faculty panel and admin panel (CRUD, CSV import) |
| 7 | Tests, polish, README, deployment guide |

## 11. Deployment

- `docker compose up --build` starts nginx, API, and Postgres
- Migrations and seed run automatically on first start (toggle via env)
- Persistent volumes for the database and uploads
- README covers local run, VPS deploy, and free-tier hosting steps

## 12. Out of Scope (needs paid services)

- Real payment gateway, email or SMS sending, parent portal, biometric attendance

## 13. Assumptions

- Fictional college name "Sample Institute of Technology" (configurable in one file)
- English UI, desktop and mobile responsive
- Output delivered as a zipped project plus run instructions
