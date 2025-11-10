"""Pydantic schemas for clip commentary queue endpoints."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class CommentaryStatus(str, Enum):
    """Lifecycle status for AI commentary generation."""

    queued = "queued"
    running = "running"
    ready = "ready"
    failed = "failed"
    blocked_safe = "blocked_safe"


class ClipCommentaryOut(BaseModel):
    """Serialized commentary payload returned by the admin API."""

    clipId: str
    status: CommentaryStatus
    title: str | None = None
    summary: str | None = None
    ttsUrl: str | None = None
    updatedTs: datetime
