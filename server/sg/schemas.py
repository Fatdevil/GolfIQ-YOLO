"""Pydantic models representing strokes-gained shot and aggregation data."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class ShotEvent(BaseModel):
    """An individual shot observation used to compute strokes gained."""

    hole: int
    shot: int
    ts: int  # milliseconds since epoch
    before_m: float
    after_m: float
    before_lie: str
    penalty: Optional[str] = None


class ShotSG(BaseModel):
    """Per-shot strokes-gained delta."""

    hole: int
    shot: int
    sg_delta: float


class HoleSG(BaseModel):
    """Aggregated strokes-gained over a hole."""

    hole: int
    sg: float
    shots: List[ShotSG]


class RunSGResult(BaseModel):
    """Aggregate strokes-gained output for a run/round."""

    holes: List[HoleSG]
    total_sg: float


__all__ = [
    "HoleSG",
    "RunSGResult",
    "ShotEvent",
    "ShotSG",
]
