"""Pydantic schemas for live viewer state."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class LiveState(BaseModel):
    """Serialized state returned to live viewers."""

    model_config = ConfigDict(populate_by_name=True)

    isLive: bool
    viewerUrl: str | None = None
    startedTs: int | None = None
    updatedTs: int | None = None
    streamId: str | None = None
    latencyMode: str | None = None
