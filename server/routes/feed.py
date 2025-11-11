"""Feed routes for public home experience."""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from fastapi import APIRouter, Header, Query, status
from fastapi.responses import JSONResponse, Response

from server.services import (
    clips_repo,
    live_stream,
    ranking,
    telemetry as telemetry_service,
)


router = APIRouter(prefix="/feed", tags=["feed"])

_CACHE_TTL_SECONDS = 60.0
_MIN_LIMIT = 5
_MAX_LIMIT = 50


@dataclass(slots=True)
class _FeedSnapshot:
    top_shots: list[dict[str, Any]]
    live: list[dict[str, Any]]
    updated_at: str
    etag: str
    expires_at: float

    def as_payload(self, limit: int) -> dict[str, Any]:
        return {
            "topShots": self.top_shots[:limit],
            "live": list(self.live),
            "updatedAt": self.updated_at,
            "etag": self.etag,
        }


_SNAPSHOT: _FeedSnapshot | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _format_iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _ensure_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        result = float(value)
    except (TypeError, ValueError):
        return None
    if result != result:  # NaN guard
        return None
    return result


def _ensure_int(value: object) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def _format_timestamp(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return _format_iso(dt)
    if isinstance(value, (int, float)):
        return _format_iso(datetime.fromtimestamp(float(value), tz=timezone.utc))
    if isinstance(value, str):
        return value
    return None


def _resolve_anchor(entry: Mapping[str, Any]) -> float:
    anchors = entry.get("anchors") or entry.get("anchorsSec")
    if isinstance(anchors, Iterable) and not isinstance(anchors, (str, bytes)):
        for candidate in anchors:
            anchor = _ensure_float(candidate)
            if anchor is not None:
                return max(0.0, anchor)
    for key in ("anchor_sec", "anchorSec", "impact_offset_sec", "impactOffsetSec"):
        anchor = _ensure_float(entry.get(key))
        if anchor is not None:
            return max(0.0, anchor)
    return 0.0


def _serialize_top_shot(entry: Mapping[str, Any]) -> dict[str, Any] | None:
    clip_id = entry.get("id") or entry.get("clipId")
    if not clip_id:
        return None
    event_id = entry.get("event_id") or entry.get("eventId")
    score = _ensure_float(entry.get("score")) or 0.0
    sg_delta = _ensure_float(entry.get("sg_delta") or entry.get("sgDelta"))
    created_at = _format_timestamp(entry.get("created_at") or entry.get("createdAt"))
    return {
        "clipId": str(clip_id),
        "eventId": str(event_id) if event_id is not None else None,
        "sgDelta": sg_delta,
        "reactions1min": _ensure_int(
            entry.get("reactions_1min") or entry.get("reactions1min")
        ),
        "reactionsTotal": _ensure_int(
            entry.get("reactions_total") or entry.get("reactionsTotal")
        ),
        "createdAt": created_at,
        "anchorSec": _resolve_anchor(entry),
        "rankScore": score,
    }


def _collect_top_shots(now: datetime) -> list[dict[str, Any]]:
    ranked = ranking.rank_top_shots(clips_repo.list_recent(), now.timestamp())
    results: list[dict[str, Any]] = []
    for entry in ranked:
        serialized = _serialize_top_shot(entry)
        if not serialized:
            continue
        results.append(serialized)
        if len(results) >= _MAX_LIMIT:
            break
    return results


def _collect_live_events() -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for event_id in live_stream.list_running_events():
        status = live_stream.status_live(event_id)
        if not status.get("running"):
            continue
        live_path = status.get("hlsPath")
        events.append(
            {
                "eventId": str(event_id),
                "viewers": _ensure_int(status.get("viewers")),
                "startedAt": status.get("startedAt"),
                "livePath": live_path,
            }
        )
    events.sort(key=lambda item: item.get("startedAt") or "", reverse=True)
    return events


def _compute_etag(payload: dict[str, Any]) -> str:
    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def _norm_etag(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip()
    if normalized.startswith("W/"):
        normalized = normalized[2:]
    return normalized.strip('"') or None


def _refresh_snapshot() -> _FeedSnapshot:
    now = _now()
    top_shots = _collect_top_shots(now)
    live_events = _collect_live_events()
    updated_at = _format_iso(now)
    etag = _compute_etag(
        {"topShots": top_shots, "live": live_events, "updatedAt": updated_at}
    )
    return _FeedSnapshot(
        top_shots=top_shots,
        live=live_events,
        updated_at=updated_at,
        etag=etag,
        expires_at=time.time() + _CACHE_TTL_SECONDS,
    )


def _get_snapshot() -> _FeedSnapshot:
    global _SNAPSHOT  # noqa: PLW0603
    now = time.time()
    if _SNAPSHOT is None or _SNAPSHOT.expires_at <= now:
        _SNAPSHOT = _refresh_snapshot()
    return _SNAPSHOT


@router.get("/home")
def read_home_feed(
    *,
    limit: int = Query(default=20),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
) -> Response:
    clamped_limit = max(_MIN_LIMIT, min(limit, _MAX_LIMIT))
    telemetry_service.emit_feed_home_requested(limit=clamped_limit)
    snapshot = _get_snapshot()

    rep_etag = f"{snapshot.etag};limit={clamped_limit}"
    headers = {
        "ETag": f'"{rep_etag}"',
        "Cache-Control": f"public, max-age={int(_CACHE_TTL_SECONDS)}",
        "Vary": "Accept, Accept-Encoding",
    }

    if _norm_etag(if_none_match) == rep_etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)

    payload = snapshot.as_payload(clamped_limit)
    telemetry_service.emit_feed_home_served(
        limit=clamped_limit,
        top_count=len(payload["topShots"]),
        live_count=len(payload["live"]),
    )
    return JSONResponse(content=payload, headers=headers)


def reset_cache_for_tests() -> None:
    """Reset cached snapshot (used in tests)."""

    global _SNAPSHOT  # noqa: PLW0603
    _SNAPSHOT = None


__all__ = ["router", "reset_cache_for_tests"]
