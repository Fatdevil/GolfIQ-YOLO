from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class Visibility(str, Enum):
    private = "private"
    event = "event"
    friends = "friends"
    public = "public"


class ReportIn(BaseModel):
    reason: str = Field(..., min_length=1, max_length=240)
    details: dict[str, Any] | None = None
    reporter: str | None = Field(default=None, min_length=1, max_length=120)


class ReportOut(BaseModel):
    id: str
    clipId: str
    ts: datetime
    reason: str
    status: str


class ModerationAction(str, Enum):
    hide = "hide"
    unhide = "unhide"
    set_visibility = "set_visibility"


class ClipModerationState(BaseModel):
    clipId: str
    hidden: bool
    visibility: Visibility
    reports: int
    updatedTs: datetime
