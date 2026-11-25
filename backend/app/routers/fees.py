import random
import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import current_user, get_db, require_roles
from app.models import FeeRecord, FeeStructure, Payment, Student
from app.routers.academics import my_student
from app.services import notify
from app.services.receipts import payment_receipt

router = APIRouter(prefix="/fees", tags=["fees"])
METHODS = {"UPI", "Credit/Debit Card", "Net Banking", "Wallet"}


def record_status(rec: FeeRecord, due: date) -> str:
    if rec.amount_paid >= rec.amount_due:
        return "paid"
    if rec.amount_paid > 0:
        return "partial"
    return "overdue" if due < date.today() else "pending"


def fee_out(rec: FeeRecord, db: Session) -> dict:
    fs = db.get(FeeStructure, rec.fee_structure_id)
    status = record_status(rec, fs.due_date)
    return {"id": rec.id, "fee_type": fs.fee_type, "semester": fs.semester,
            "due_date": fs.due_date.isoformat(), "amount_due": rec.amount_due,
            "amount_paid": rec.amount_paid, "balance": round(rec.amount_due - rec.amount_paid, 2),
            "status": status}


@router.get("/me")
def my_fees(user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    recs = [fee_out(r, db) for r in db.query(FeeRecord).filter(FeeRecord.student_id == s.id).all()]
    total_due = sum(r["amount_due"] for r in recs)
    total_paid = sum(r["amount_paid"] for r in recs)
    return {"records": recs, "total_due": total_due, "total_paid": total_paid,
            "total_balance": round(total_due - total_paid, 2)}


class PayIn(BaseModel):
    fee_record_id: int
    method: str
    amount: float


@router.post("/pay")
def pay(body: PayIn, user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    rec = db.get(FeeRecord, body.fee_record_id)
    if not rec or rec.student_id != s.id:
        raise HTTPException(404, "Fee record not found")
    if body.method not in METHODS:
        raise HTTPException(400, "Choose a valid payment method")
    balance = rec.amount_due - rec.amount_paid
    if balance <= 0:
        raise HTTPException(400, "This fee is already paid")
    if not (0 < body.amount <= balance):
        raise HTTPException(400, f"Amount must be between 0 and the pending balance Rs. {balance:,.2f}")

    # Mock gateway: simulated processing delay; optional failure rate for testing.
    import time
    time.sleep(1)
    failed = random.random() < settings.MOCK_PAYMENT_FAIL_RATE
    txn = f"TXN{datetime.now():%Y%m%d%H%M%S}{uuid.uuid4().hex[:6].upper()}"
    pmt = Payment(student_id=s.id, fee_record_id=rec.id, amount=body.amount,
                  method=body.method, status="failed" if failed else "success", txn_id=txn)
    db.add(pmt)
    if not failed:
        rec.amount_paid = round(rec.amount_paid + body.amount, 2)
        fs = db.get(FeeStructure, rec.fee_structure_id)
        notify.create(db, title="Payment successful",
                      body=f"Rs. {body.amount:,.2f} received for {fs.fee_type} (sem {fs.semester}). Txn {txn}.",
                      type_="payment", scope="individual", created_by=user.id, user_ids=[user.id])
    db.commit()
    return {"txn_id": txn, "status": pmt.status, "payment_id": pmt.id,
            "fee": fee_out(rec, db)}


@router.get("/payments/me")
def my_payments(user=Depends(require_roles("student")), db: Session = Depends(get_db)):
    s = my_student(db, user)
    return [{"id": p.id, "amount": p.amount, "method": p.method, "status": p.status,
             "txn_id": p.txn_id, "paid_at": p.paid_at.isoformat()}
            for p in db.query(Payment).filter(Payment.student_id == s.id)
                       .order_by(Payment.paid_at.desc()).all()]


@router.get("/payments/{payment_id}/receipt")
def receipt(payment_id: int, user=Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Payment, payment_id)
    if not p:
        raise HTTPException(404, "Not found")
    if user.role == "student" and my_student(db, user).id != p.student_id:
        raise HTTPException(403, "Not your payment")
    if user.role == "faculty":
        raise HTTPException(403, "Not allowed")
    rec = db.get(FeeRecord, p.fee_record_id)
    fs = db.get(FeeStructure, rec.fee_structure_id)
    pdf = payment_receipt(p, db.get(Student, p.student_id), f"{fs.fee_type} (sem {fs.semester})")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="receipt_{p.txn_id}.pdf"'})


class StructureIn(BaseModel):
    dept_id: int
    semester: int
    fee_type: str
    amount: float
    due_date: date


@router.get("/structures")
def list_structures(user=Depends(require_roles("admin")), db: Session = Depends(get_db)):
    return [{"id": f.id, "dept_id": f.dept_id, "semester": f.semester, "fee_type": f.fee_type,
             "amount": f.amount, "due_date": f.due_date.isoformat()}
            for f in db.query(FeeStructure).order_by(FeeStructure.semester).all()]


@router.post("/structures")
def add_structure(body: StructureIn, user=Depends(require_roles("admin")), db: Session = Depends(get_db)):
    fs = FeeStructure(**body.model_dump())
    db.add(fs)
    db.flush()
    # Assign this fee to every student in that dept and semester.
    for s in db.query(Student).filter(Student.dept_id == body.dept_id,
                                      Student.semester == body.semester).all():
        db.add(FeeRecord(student_id=s.id, fee_structure_id=fs.id, amount_due=body.amount,
                         amount_paid=0, status="pending"))
    db.commit()
    return {"id": fs.id}
