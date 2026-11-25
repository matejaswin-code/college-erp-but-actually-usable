"""End-to-end smoke tests. Run from backend/: pytest -q
Requires a seeded database (python -m app.seed --reset) at DATABASE_URL."""
import io
from datetime import date

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def login(login_id, password):
    r = client.post("/auth/login", json={"login": login_id, "password": password})
    assert r.status_code == 200, r.text
    return r


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_bad_login_rejected():
    r = client.post("/auth/login", json={"login": "ADMIN01", "password": "wrong"})
    assert r.status_code == 401


def test_student_sees_own_profile_and_attendance():
    client.cookies.clear()
    login("1SI25CS011", "Aar@5506")
    prof = client.get("/students/me").json()
    assert prof["usn"] == "1SI25CS011"
    att = client.get("/attendance/me").json()
    assert len(att["courses"]) == 5


def test_student_cannot_access_admin_routes():
    client.cookies.clear()
    login("1SI25CS011", "Aar@5506")
    assert client.get("/students").status_code == 403


def test_faculty_marks_attendance_for_own_course():
    client.cookies.clear()
    login("FACCS01", "Fac@9499")
    courses = client.get("/courses/me").json()
    assert courses, "faculty should have courses"
    cid = courses[0]["id"]
    students = client.get(f"/courses/{cid}/students").json()
    today = date.today().isoformat()
    r = client.post("/attendance", json={"course_id": cid, "date": today,
                                         "records": [{"student_id": students[0]["id"], "status": "P"}]})
    assert r.status_code == 200, r.text


def test_faculty_blocked_from_other_courses():
    client.cookies.clear()
    login("FACCS01", "Fac@9499")
    other = client.get("/admin/courses")  # admin-only
    assert other.status_code == 403


def test_mock_payment_flow():
    client.cookies.clear()
    login("1SI25CS011", "Aar@5506")
    fees = client.get("/fees/me").json()
    pending = [f for f in fees["records"] if f["balance"] > 0]
    if not pending:
        return
    rec = pending[0]
    r = client.post("/fees/pay", json={"fee_record_id": rec["id"], "method": "UPI",
                                       "amount": rec["balance"]})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "success"
    pdf = client.get(f"/fees/payments/{r.json()['payment_id']}/receipt")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_admin_notice_and_student_inbox():
    client.cookies.clear()
    login("ADMIN01", "Admin@2026")
    r = client.post("/notifications", json={"title": "Test", "body": "Hello", "scope": "semester",
                                            "semester": 2})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    login("1SI25CS011", "Aar@5506")
    inbox = client.get("/notifications/me").json()
    assert any(i["title"] == "Test" for i in inbox["items"])


def test_results_calculation():
    from app.services.results import compute
    from app.models import Mark
    m = Mark(ia1=40, ia2=30, ia3=50, assignment=8, lab=7, see=80)
    out = compute(m)
    # best two IA avg = 45, + 8 + 7 = 60, capped at 50 -> internal 50; SEE 80/2 = 40; total 90
    assert out["internal"] == 50.0 and out["total"] == 90.0 and out["grade"] == "O"
