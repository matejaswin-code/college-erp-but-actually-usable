# Sample Institute of Technology - College ERP

A full college ERP: login, student / faculty / admin portals, attendance, marks and results (SGPA/CGPA),
timetable, exams, assignments with submissions and grading, study materials, fees with a mock payment
gateway and PDF receipts, a notification center, admin CRUD, CSV import/export, and an audit log.
All components are free and open source. Seeded with the 120 students, 15 faculty and 1 admin in `backend/seed_data/FAKE_DATA.md`.

## Quick start with Docker (recommended)

Requirements: Docker Desktop (or Docker Engine + Compose v2).

```bash
cd college-erp
cp .env.example .env          # optional: edit JWT_SECRET
docker compose up --build
```

First start takes a few minutes: it builds the images, runs migrations and seeds the database.
Then open **http://localhost:8080**.

Stop with `Ctrl+C`, or `docker compose down` (keeps data). `docker compose down -v` wipes the database and uploads.

## Quick start without Docker (local development)

Requirements: Python 3.11+. PostgreSQL is optional; SQLite works for a quick try.

```bash
cd college-erp/backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Option A: SQLite (no database server needed)
export DATABASE_URL="sqlite:///./dev.db"
export UPLOAD_DIR="./uploads"

# Option B: PostgreSQL (set your own URL)
# export DATABASE_URL="postgresql+psycopg2://erp:erp@localhost:5432/erp"

alembic upgrade head                 # create tables
python -m app.seed                   # load demo data (add --reset to rebuild)
uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000**. The backend serves the frontend in this mode.
On Windows PowerShell, use `$env:DATABASE_URL="sqlite:///./dev.db"` instead of `export`.

## Demo logins

All demo passwords are fake and for testing only.

| Role | Login | Password |
|---|---|---|
| Admin | `ADMIN01` (or admin@sit-demo.edu.in) | `Admin@2026` |
| Faculty | `FACCS01` (Data Structures, CSE) | `Fac@9499` |
| Faculty | `FACEC01` (Digital Electronics, ECE) | `Fac@8570` |
| Faculty | `FACME01` (Thermodynamics, ME) | `Fac@4908` |
| Student | `1SI25CS011` (Aarav Prasad, CSE sem 2) | `Aar@5506` |
| Student | `1SI24EC021` (Ishaan Das, ECE sem 4) | `Ish@2622` |

The full list of logins is in `backend/seed_data/FAKE_DATA.md`. Students can log in with their USN or email.

## What each role can do

- **Student:** dashboard, profile (edit contact and guardian details), attendance with a warning under 75%,
  published marks, SGPA/CGPA, timetable, exams, assignment submission, study materials, fee payment with
  receipts, notices, and password change.
- **Faculty:** courses, mark attendance per class, enter marks and publish them, post assignments with an
  optional attachment, view and grade submissions, upload materials, send notices to their own course.
- **Admin:** dashboard stats, add and search students, add faculty, reset passwords, activate or deactivate
  accounts, departments and courses, assign faculty to course sections, fee structures, global notices,
  automated reminders, CSV import and export, audit log.

## Grading rules

- Internal (out of 50) = average of the best two of IA1, IA2, IA3, plus assignment and lab marks, capped at 50.
- SEE (out of 100) is scaled to 50. Total = internal + SEE/2, out of 100.
- Grades: 90+ O, 80+ A+, 70+ A, 60+ B+, 50+ B, 45+ C, 40+ P, below 40 F.
- SGPA = credit-weighted average of grade points in a semester. CGPA = the same across all semesters.
- Students only see marks after the faculty publishes them.

## Mock payment gateway

Choose a fee, a method (UPI, Card, Net Banking or Wallet), an amount up to the balance, then press Pay.
Payments succeed after a short delay and produce a transaction ID, a PDF receipt, and a notification.
Set `MOCK_PAYMENT_FAIL_RATE` (0 to 1) to simulate failures for testing. The default is 0.

## Running the tests

```bash
cd backend
pytest -q
```

The tests need a seeded database. Run `python -m app.seed --reset` first, using the same `DATABASE_URL`.

## Scheduled reminders

Deadline (48 h) and fee-due notifications are created by `POST /admin/reminders/run`, or the
"Run reminders now" button on the admin dashboard. To run them automatically each day, call that endpoint
from cron, for example:

```
0 8 * * *  curl -s -X POST http://localhost:8080/api/admin/reminders/run -b "access_token=<admin cookie>"
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | Postgres in Docker | Database connection |
| `JWT_SECRET` | dev placeholder | Signs login tokens. Change it for any real use. |
| `JWT_EXPIRE_MINUTES` | 60 | Session length |
| `UPLOAD_DIR` | `/data/uploads` | Where submissions and materials are stored |
| `MOCK_PAYMENT_FAIL_RATE` | 0 | Simulated payment failure rate |
| `RUN_SEED_ON_START` | true | Docker only: seed on start if the DB is empty |
| `CORS_ORIGINS` | `http://localhost:8080` | Allowed origins for cross-origin calls |

## Project layout

```
college-erp/
├── docker-compose.yml        Postgres + API + nginx
├── .env.example
├── nginx/default.conf        Serves the frontend, proxies /api to the backend
├── frontend/                 Single-page app (HTML, CSS, vanilla JS, no build step)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini / alembic/   Database migrations
│   ├── seed_data/FAKE_DATA.md   Source for the demo data
│   ├── app/
│   │   ├── main.py              FastAPI app
│   │   ├── seed.py              python -m app.seed
│   │   ├── core/                Config, JWT and bcrypt, role guards
│   │   ├── models/              SQLAlchemy models
│   │   ├── routers/             auth, students, academics, coursework, fees, notifications, admin
│   │   └── services/            Results, uploads, notifications, enrollment, receipts
│   └── tests/test_smoke.py
└── BUILD_PLAN.md
```

## API

Interactive docs are at `/docs` (Swagger), for example http://localhost:8000/docs in local mode
or http://localhost:8080/api/docs with Docker.

## Troubleshooting

- **Port 8080 already in use:** change `"8080:80"` in `docker-compose.yml`.
- **Login fails after a reset:** the seed is idempotent and does not overwrite data. Run `python -m app.seed --reset` (or `docker compose down -v` then up again) to start over.
- **"Not logged in" after a while:** sessions last `JWT_EXPIRE_MINUTES`. Log in again.
- **Uploads rejected:** only PDF, Office, text, zip and common image files up to 10 MB are accepted.

## Not included (needs paid services)

A real payment gateway, email or SMS sending (so forgot-password is an admin reset), a parent portal,
and biometric attendance. These are listed as out of scope in the build plan.

## Notes on the build

The build plan suggested React and Vite. The frontend is plain HTML and JavaScript instead, so it runs
without a Node build step. It covers the same features in a simpler form. A React rewrite can be done later
against the same API.
