from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class TelemetrySample(BaseModel):
    session_id: str = Field(..., min_length=1)
    ts: float
    frame_id: Optional[int] = None
    source: str = "arhud"
    impact: Optional[bool] = None
    ball: Optional[Dict[str, Any]] = None
    club: Optional[Dict[str, Any]] = None
    launch: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"
