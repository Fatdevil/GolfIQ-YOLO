from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

try:  # pragma: no cover - compatibility shim
    from pydantic import ConfigDict  # type: ignore
except ImportError:  # pragma: no cover - Pydantic v1 fallback
    ConfigDict = None  # type: ignore


class TelemetrySample(BaseModel):
    session_id: str = Field(..., min_length=1)
    ts: float
    frame_id: Optional[int] = None
    source: str = "arhud"
    impact: Optional[bool] = None
    ball: Optional[Dict[str, Any]] = None
    club: Optional[Dict[str, Any]] = None
    launch: Optional[Dict[str, Any]] = None

    if ConfigDict is not None:  # pragma: no branch
        model_config = ConfigDict(extra="allow")  # type: ignore[call-arg]
    else:  # pragma: no cover - legacy fallback
        class Config:
            extra = "allow"


class Telemetry(BaseModel):
    """Simplified telemetry payload used for real-time streaming."""

    timestampMs: int = Field(..., ge=0)
    club: Optional[str] = None
    ballSpeed: Optional[float] = None
    clubSpeed: Optional[float] = None
    launchAngle: Optional[float] = None
    spinRpm: Optional[int] = None
    carryMeters: Optional[float] = None

    if ConfigDict is not None:  # pragma: no branch
        model_config = ConfigDict(extra="ignore")  # type: ignore[call-arg]
    else:  # pragma: no cover - legacy fallback
        class Config:
            extra = "ignore"
