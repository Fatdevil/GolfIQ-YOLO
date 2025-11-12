"""Pydantic schemas for run shot time anchors."""

from __future__ import annotations

from pydantic import BaseModel, Field, ValidationInfo, field_validator


class AnchorIn(BaseModel):
    hole: int = Field(..., ge=1)
    shot: int = Field(..., ge=1)
    clipId: str
    tStartMs: int = Field(..., ge=0)
    tEndMs: int = Field(..., ge=1)

    @field_validator("tEndMs")
    @classmethod
    def _end_after_start(cls, value: int, info: ValidationInfo) -> int:
        start = info.data.get("tStartMs")
        if start is not None and value <= int(start):
            raise ValueError("tEndMs must be > tStartMs")
        return value


class AnchorOut(AnchorIn):
    runId: str
    version: int
    ts: int
