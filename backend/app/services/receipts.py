import io

from reportlab.lib.pagesizes import A5
from reportlab.pdfgen import canvas


def payment_receipt(payment, student, fee_label: str) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    w, h = A5
    y = h - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, y, "Sample Institute of Technology")
    y -= 22
    c.setFont("Helvetica", 11)
    c.drawString(40, y, "Fee Payment Receipt")
    y -= 30
    rows = [
        ("Transaction ID", payment.txn_id),
        ("Student", f"{student.name} ({student.usn})"),
        ("Fee", fee_label),
        ("Amount paid", f"Rs. {payment.amount:,.2f}"),
        ("Method", payment.method),
        ("Status", payment.status),
        ("Date", payment.paid_at.strftime("%d-%m-%Y %H:%M")),
    ]
    for label, value in rows:
        c.drawString(40, y, f"{label}:")
        c.drawString(160, y, str(value))
        y -= 20
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(40, 30, "Mock payment gateway. Demo receipt, not a real transaction.")
    c.showPage()
    c.save()
    return buf.getvalue()
