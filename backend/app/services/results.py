"""Marks and grading rules.

Internal (CIE, out of 50): average of the best two of IA1/IA2/IA3 (each out of 50),
plus assignment and lab marks, capped at 50.
SEE is out of 100 and is scaled to 50. Total = internal + scaled SEE (out of 100).
"""
from app.models import Mark

GRADE_TABLE = [
    (90, "O", 10), (80, "A+", 9), (70, "A", 8), (60, "B+", 7),
    (50, "B", 6), (45, "C", 5), (40, "P", 4), (0, "F", 0),
]


def compute(mark: Mark) -> dict:
    ias = sorted([v for v in (mark.ia1, mark.ia2, mark.ia3) if v is not None], reverse=True)
    best_two = ias[:2]
    ia_avg = sum(best_two) / len(best_two) if best_two else 0.0
    internal = min(50.0, ia_avg + (mark.assignment or 0) + (mark.lab or 0))
    see_scaled = (mark.see or 0) / 2
    total = round(internal + see_scaled, 1)
    grade, points = "F", 0
    for threshold, g, p in GRADE_TABLE:
        if total >= threshold:
            grade, points = g, p
            break
    if mark.see is None:
        grade, points = "-", 0
    return {"internal": round(internal, 1), "see": mark.see, "total": total,
            "grade": grade, "grade_points": points}


def sgpa(rows: list[tuple[int, int]]) -> float:
    """rows: (credits, grade_points) for one semester."""
    credits = sum(c for c, _ in rows)
    if not credits:
        return 0.0
    return round(sum(c * p for c, p in rows) / credits, 2)
