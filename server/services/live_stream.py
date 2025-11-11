"""Live stream lifecycle management for event tee cams."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from server.services import telemetry as telemetry_service


@dataclass
class _LiveState:
    event_id: str
    running: bool = False
    hls_path: str | None = None
    started_at: datetime | None = None
    source: str | None = None
    viewers: set[str] = field(default_factory=set)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "eventId": self.event_id,
            "running": self.running,
            "hlsPath": self.hls_path,
            "startedAt": (
                self.started_at.isoformat().replace("+00:00", "Z")
                if isinstance(self.started_at, datetime)
                else None
            ),
            "source": self.source,
            "viewers": sorted(self.viewers),
        }


_STATE: Dict[str, _LiveState] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _log_root() -> Path:
    root = Path(os.getenv("LIVE_STREAM_DATA_DIR", "data/live")).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _log_path() -> Path:
    return _log_root() / "streams.jsonl"


def _append_record(event_id: str, action: str, state: _LiveState) -> None:
    payload = {
        "ts": _now().isoformat().replace("+00:00", "Z"),
        "eventId": event_id,
        "action": action,
        "state": state.to_dict(),
    }
    path = _log_path()
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def reset() -> None:
    """Reset in-memory state (used in tests)."""

    _STATE.clear()


def _mock_hls_path(event_id: str) -> str:
    base = os.getenv("LIVE_STREAM_MOCK_PREFIX", "/hls/mock")
    prefix = base.rstrip("/")
    return f"{prefix}/{event_id}/index.m3u8"


def _ensure_state(event_id: str) -> _LiveState:
    state = _STATE.get(event_id)
    if state is None:
        state = _LiveState(event_id=event_id)
        _STATE[event_id] = state
    return state


def start_live(event_id: str, source: str = "mock") -> dict[str, Any]:
    """Start streaming for an event, returning HLS metadata."""

    state = _ensure_state(event_id)
    if state.running:
        raise RuntimeError("live stream already running")

    now = _now()
    if source == "mock":
        hls_path = _mock_hls_path(event_id)
        go_live_ms = 0
    else:
        if not os.getenv("LIVEKIT_WHIP_URL"):
            raise RuntimeError("livekit whip url not configured")
        hls_path = f"/hls/{event_id}/index.m3u8"
        go_live_ms = 0

    state.running = True
    state.hls_path = hls_path
    state.started_at = now
    state.source = source
    state.viewers.clear()

    _append_record(event_id, "start", state)
    telemetry_service.emit_live_start(
        event_id,
        source=source,
        hls_path=hls_path,
        go_live_ms=go_live_ms,
    )
    return {"hlsPath": hls_path, "startedAt": state.to_dict()["startedAt"]}


def stop_live(event_id: str) -> dict[str, Any]:
    state = _ensure_state(event_id)
    if not state.running:
        return {"stopped": False}

    state.running = False
    state.hls_path = None
    state.started_at = None
    state.source = None
    state.viewers.clear()

    _append_record(event_id, "stop", state)
    telemetry_service.emit_live_stop(event_id)
    return {"stopped": True}


def status_live(event_id: str) -> dict[str, Any]:
    state = _ensure_state(event_id)
    viewers = len(state.viewers) if state.running else 0
    payload = {
        "running": state.running,
        "startedAt": state.to_dict()["startedAt"],
        "viewers": viewers,
    }
    if state.running and state.hls_path:
        payload["hlsPath"] = state.hls_path
    return payload


def register_viewer(event_id: str, viewer_id: str) -> None:
    state = _ensure_state(event_id)
    if not state.running:
        return
    if viewer_id in state.viewers:
        return
    state.viewers.add(viewer_id)
    _append_record(event_id, "viewer", state)
    telemetry_service.emit_live_viewer_join(event_id, viewer_id)


def viewers_count(event_id: str) -> int:
    state = _ensure_state(event_id)
    return len(state.viewers)


def list_running_events() -> list[str]:
    """Return event identifiers that currently have an active live stream."""

    return [event_id for event_id, state in _STATE.items() if state.running]
