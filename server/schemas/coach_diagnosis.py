from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel

CoachCategory = Literal["tee", "approach", "short", "putt", "sequence", "strategy"]


class CoachFinding(BaseModel):
    id: str
    category: CoachCategory
    severity: Literal["info", "warning", "critical"]
    title: str
    message: str
    evidence: dict[str, Any] = {}
    suggested_missions: list[str] = []
    suggested_focus: list[str] = []


class CoachDiagnosis(BaseModel):
    run_id: str
    findings: list[CoachFinding]


__all__ = [
    "CoachCategory",
    "CoachFinding",
    "CoachDiagnosis",
]
