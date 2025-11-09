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


def _now_ms() -> int:
    from time import time

    return int(time() * 1000)


__all__ = [
    "set_events_telemetry_emitter",
    "record_event_created",
    "record_event_joined",
    "record_board_resync",
]
