from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


CADDIE_ADVICE_SHOWN_V1 = "CADDIE_ADVICE_SHOWN_V1"
CADDIE_ADVICE_ACCEPTED_V1 = "CADDIE_ADVICE_ACCEPTED_V1"
SHOT_OUTCOME_V1 = "SHOT_OUTCOME_V1"


class CaddieTelemetryEvent(BaseModel):
    type: Literal[
        CADDIE_ADVICE_SHOWN_V1,
        CADDIE_ADVICE_ACCEPTED_V1,
        SHOT_OUTCOME_V1,
    ]
    memberId: str
    runId: str
    hole: int
    shotIndex: Optional[int] = None
    courseId: Optional[str] = None
    recommendedClub: Optional[str] = None
    selectedClub: Optional[str] = None
    club: Optional[str] = None
    targetDistance_m: Optional[float] = None
    carry_m: Optional[float] = None
    endDistanceToPin_m: Optional[float] = None
    resultCategory: Optional[str] = None
    adviceId: Optional[str] = None

    class Config:
        extra = "ignore"
