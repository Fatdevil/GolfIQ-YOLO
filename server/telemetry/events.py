"""Telemetry helpers for event lifecycle instrumentation."""

from __future__ import annotations

import logging
from typing import Callable, Dict, Mapping, MutableMapping, Optional

EventsTelemetryEmitter = Callable[[str, Mapping[str, object]], None]

_emitter: Optional[EventsTelemetryEmitter] = None
_logger = logging.getLogger("server.telemetry.events")


def set_events_telemetry_emitter(candidate: EventsTelemetryEmitter | None) -> None:
    """Register a telemetry emitter used for events instrumentation."""

    global _emitter
    _emitter = candidate if callable(candidate) else None


def _safe_emit(event: str, payload: MutableMapping[str, object]) -> None:
    if not _emitter:
        _logger.debug("telemetry emitter not configured for event %s", event)
        return
    try:
        _emitter(event, dict(payload))
    except Exception:  # pragma: no cover - defensive logging only
        _logger.exception("failed to emit telemetry event %s", event)


def record_event_created(event_id: str, code: str, *, name: str | None = None) -> None:
    payload: Dict[str, object] = {"eventId": event_id, "code": code}
    if name:
        payload["name"] = name
    payload["ts"] = _now_ms()
    _safe_emit("events.create", payload)


def record_event_joined(event_id: str, member_id: str | None = None) -> None:
    payload: Dict[str, object] = {"eventId": event_id}
    if member_id:
        payload["memberId"] = member_id
    payload["ts"] = _now_ms()
    _safe_emit("events.join", payload)


def record_score_write(
    event_id: str,
    duration_ms: float,
    *,
    status: str,
    fingerprint: str | None = None,
    revision: int | None = None,
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "durationMs": int(max(0, round(duration_ms))),
        "status": status,
        "ts": _now_ms(),
    }
    if fingerprint:
        payload["fingerprint"] = fingerprint
    if revision is not None:
        payload["revision"] = int(revision)
    _safe_emit("score.write_ms", payload)


def record_score_conflict(
    event_id: str, *, revision: int | None = None, fingerprint: str | None = None
) -> None:
    payload: Dict[str, object] = {"eventId": event_id, "ts": _now_ms()}
    if revision is not None:
        payload["revision"] = int(revision)
    if fingerprint:
        payload["fingerprint"] = fingerprint
    _safe_emit("conflict.count", payload)


def record_board_build(
    event_id: str,
    duration_ms: float,
    *,
    mode: str | None = None,
    rows: int | None = None,
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "durationMs": int(max(0, round(duration_ms))),
        "ts": _now_ms(),
    }
    if mode:
        payload["mode"] = mode
    if rows is not None:
        payload["rows"] = int(rows)
    _safe_emit("board.build_ms", payload)


def record_board_resync(
    event_id: str, *, reason: str | None = None, attempt: int | None = None
) -> None:
    payload: Dict[str, object] = {"eventId": event_id}
    if reason:
        payload["reason"] = reason
    if attempt is not None:
        payload["attempt"] = attempt
    payload["ts"] = _now_ms()
    _safe_emit("events.resync", payload)


def record_host_action(
    event_id: str, action: str, *, member_id: str | None = None
) -> None:
    payload: Dict[str, object] = {"eventId": event_id, "action": action}
    if member_id:
        payload["memberId"] = member_id
    payload["ts"] = _now_ms()
    _safe_emit("events.host.action", payload)


def record_tv_tick(
    event_id: str, duration_ms: float, *, source: str | None = None
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "durationMs": int(max(0, round(duration_ms))),
    }
    if source:
        payload["source"] = source
    payload["ts"] = _now_ms()
    _safe_emit("events.tv.tick_ms", payload)


def record_tv_rotate(
    event_id: str, interval_ms: float, view: str, *, source: str | None = None
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "intervalMs": int(max(0, round(interval_ms))),
        "view": view,
    }
    if source:
        payload["source"] = source
    payload["ts"] = _now_ms()
    _safe_emit("events.tv.rotate", payload)


def _now_ms() -> int:
    from time import time

    return int(time() * 1000)


__all__ = [
    "set_events_telemetry_emitter",
    "record_event_created",
    "record_event_joined",
    "record_board_resync",
    "record_board_build",
    "record_host_action",
    "record_tv_tick",
    "record_tv_rotate",
    "record_score_write",
    "record_score_conflict",
]
