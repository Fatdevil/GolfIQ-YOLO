from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

try:  # pragma: no cover - compatibility shim
    from pydantic import ConfigDict  # type: ignore
except ImportError:  # pragma: no cover - Pydantic v1 fallback
    ConfigDict = None  # type: ignore

TimelineEventType = Literal[
    "swing_start",
    "impact",
    "peak_hips",
    "peak_shoulders",
    "tempo_marker",
    "hole_transition",
    "coach_cue",
    "mission_event",
]


class TimelineEvent(BaseModel):
    ts: float = Field(..., description="Seconds from run start for this event")
    type: TimelineEventType
    label: Optional[str] = None
    data: Optional[Dict[str, object]] = None


class SessionTimeline(BaseModel):
    run_id: str = Field(..., alias="runId")
    events: List[TimelineEvent] = Field(default_factory=list)

    if ConfigDict is not None:  # pragma: no branch
        model_config = ConfigDict(populate_by_name=True)  # type: ignore[call-arg]
    else:  # pragma: no cover - legacy fallback

        class Config:
            allow_population_by_field_name = True
