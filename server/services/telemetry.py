"""Service-level telemetry helpers for clip commentary."""

from __future__ import annotations

from typing import Dict, Mapping

from server.telemetry import events as telemetry_events


def _now_ms() -> int:
    from time import time

    return int(time() * 1000)


def _emit(event: str, payload: Mapping[str, object]) -> None:
    telemetry_events.emit(event, payload)


def emit_commentary_request(
    event_id: str,
    clip_id: str,
    *,
    member_id: str | None = None,
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "clipId": clip_id,
        "ts": _now_ms(),
    }
    if member_id:
        payload["memberId"] = member_id
    _emit("clip.commentary.request", payload)


def emit_commentary_running(event_id: str, clip_id: str) -> None:
    _emit(
        "clip.commentary.running",
        {"eventId": event_id, "clipId": clip_id, "ts": _now_ms()},
    )


def emit_commentary_done(
    event_id: str,
    clip_id: str,
    *,
    has_tts: bool,
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "clipId": clip_id,
        "hasTts": bool(has_tts),
        "ts": _now_ms(),
    }
    _emit("clip.commentary.done", payload)


def emit_commentary_failed(event_id: str, clip_id: str, error: str) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "clipId": clip_id,
        "error": error,
        "ts": _now_ms(),
    }
    _emit("clip.commentary.failed", payload)


def emit_commentary_blocked_safe(
    event_id: str,
    clip_id: str,
    *,
    member_id: str | None = None,
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "clipId": clip_id,
        "ts": _now_ms(),
    }
    if member_id:
        payload["memberId"] = member_id
    _emit("clip.commentary.blocked_safe", payload)


def emit_commentary_play_tts(event_id: str, clip_id: str) -> None:
    _emit(
        "clip.commentary.play_tts",
        {"eventId": event_id, "clipId": clip_id, "ts": _now_ms()},
    )


def emit_clip_reported(
    clip_id: str, *, reason: str, reporter: str | None = None
) -> None:
    payload: Dict[str, object] = {
        "clipId": clip_id,
        "reason": reason,
        "ts": _now_ms(),
    }
    if reporter:
        payload["reporter"] = reporter
    _emit("clip.reported", payload)


def emit_clip_moderation_hide(clip_id: str, member_id: str | None = None) -> None:
    payload: Dict[str, object] = {
        "clipId": clip_id,
        "ts": _now_ms(),
    }
    if member_id:
        payload["memberId"] = member_id
    _emit("clip.moderation.hide", payload)


def emit_clip_moderation_unhide(clip_id: str, member_id: str | None = None) -> None:
    payload: Dict[str, object] = {
        "clipId": clip_id,
        "ts": _now_ms(),
    }
    if member_id:
        payload["memberId"] = member_id
    _emit("clip.moderation.unhide", payload)


def emit_clip_visibility_changed(
    clip_id: str,
    *,
    visibility: str,
    member_id: str | None = None,
) -> None:
    payload: Dict[str, object] = {
        "clipId": clip_id,
        "visibility": visibility,
        "ts": _now_ms(),
    }
    if member_id:
        payload["memberId"] = member_id
    _emit("clip.visibility.changed", payload)


def emit_clip_sg_recorded(
    clip_id: str,
    *,
    sg_delta: float,
    anchor_sec: float | None = None,
) -> None:
    payload: Dict[str, object] = {
        "clipId": clip_id,
        "sgDelta": float(sg_delta),
        "ts": _now_ms(),
    }
    if anchor_sec is not None:
        payload["anchorSec"] = float(anchor_sec)
    _emit("clip.sg.recorded", payload)


def emit_clip_rank_evaluated(
    event_id: str,
    *,
    clip_count: int,
    top_score: float | None,
) -> None:
    payload: Dict[str, object] = {
        "eventId": event_id,
        "clipCount": int(clip_count),
        "ts": _now_ms(),
    }
    if top_score is not None:
        payload["topScore"] = float(top_score)
    _emit("clip.rank.evaluated", payload)


__all__ = [
    "emit_commentary_request",
    "emit_commentary_running",
    "emit_commentary_done",
    "emit_commentary_failed",
    "emit_commentary_blocked_safe",
    "emit_commentary_play_tts",
    "emit_clip_reported",
    "emit_clip_moderation_hide",
    "emit_clip_moderation_unhide",
    "emit_clip_visibility_changed",
    "emit_clip_sg_recorded",
    "emit_clip_rank_evaluated",
]
