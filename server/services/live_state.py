"""In-memory live viewer heartbeat state management."""

from __future__ import annotations

from dataclasses import dataclass
from time import time
from typing import Dict

from server.schemas.live import LiveState


@dataclass
class _Session:
    viewer_url: str | None = None
    stream_id: str | None = None
    started_ts: int | None = None
    updated_ts: int | None = None
    latency_mode: str | None = None


_SESSIONS: Dict[str, _Session] = {}


def _now() -> int:
    return int(time())


def reset() -> None:
    """Clear all stored session state (used in tests)."""

    _SESSIONS.clear()


def upsert(
    event_id: str,
    *,
    stream_id: str | None = None,
    viewer_url: str | None = None,
    latency_mode: str | None = None,
) -> _Session:
    """Insert or update heartbeat information for *event_id*."""

    session = _SESSIONS.get(event_id)
    now = _now()
    if session is None:
        session = _Session(started_ts=now, updated_ts=now)
        _SESSIONS[event_id] = session
    else:
        if session.started_ts is None:
            session.started_ts = now
        session.updated_ts = now

    if stream_id is not None:
        session.stream_id = stream_id or None
    if viewer_url is not None:
        session.viewer_url = viewer_url or None
    if latency_mode is not None:
        session.latency_mode = latency_mode or None

    return session


def mark_offline(event_id: str) -> None:
    """Mark *event_id* as offline while retaining last heartbeat timestamp."""

    session = _SESSIONS.get(event_id)
    now = _now()
    if session is None:
        session = _Session()
        _SESSIONS[event_id] = session
    session.viewer_url = None
    session.stream_id = None
    session.latency_mode = None
    session.started_ts = None
    session.updated_ts = now


def as_state(event_id: str, ttl_seconds: int, default_latency: str | None) -> LiveState:
    """Return the LiveState view for *event_id*."""

    session = _SESSIONS.get(event_id)
    now = _now()

    if session is None:
        return LiveState(
            isLive=False,
            viewerUrl=None,
            startedTs=None,
            updatedTs=None,
            streamId=None,
            latencyMode=default_latency,
        )

    updated_ts = session.updated_ts
    is_live = bool(updated_ts and now - updated_ts < max(1, ttl_seconds))
    viewer_url = session.viewer_url if is_live else None
    latency_mode = session.latency_mode or default_latency

    return LiveState(
        isLive=is_live,
        viewerUrl=viewer_url,
        startedTs=session.started_ts,
        updatedTs=updated_ts,
        streamId=session.stream_id,
        latencyMode=latency_mode,
    )


__all__ = ["as_state", "mark_offline", "reset", "upsert"]
