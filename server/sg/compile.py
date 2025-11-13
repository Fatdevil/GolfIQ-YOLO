from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Mapping

from ..api.routers.run_scores import _RECORDED_EVENTS, _RECORDED_EVENTS_LOCK

from .schemas import ShotEvent


def run_events_snapshot(run_id: str) -> list[dict]:
    with _RECORDED_EVENTS_LOCK:
        events_for_run: Dict[str, Dict[str, Any]] = dict(
            _RECORDED_EVENTS.get(run_id, {})
        )
    return sorted(
        events_for_run.values(),
        key=lambda e: (e.get("ts", 0), json.dumps(e, sort_keys=True)),
    )


def fingerprint(events: list[dict]) -> str:
    return hashlib.sha1(
        json.dumps(events, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _infer_lie_after(
    payload: Mapping[str, Any], after_distance: float, before_lie: str
) -> str:
    raw = payload.get("lie_after") or payload.get("after_lie")
    if isinstance(raw, str) and raw.strip():
        return raw
    if after_distance <= 0:
        return "holed"
    if before_lie.lower() == "green":
        return "green"
    if after_distance <= 25:
        return "green"
    return before_lie


def compile_shot_events(run_id: str) -> list[ShotEvent]:
    events = run_events_snapshot(run_id)
    shots: List[ShotEvent] = []
    for e in events:
        payload = e.get("payload") or {}
        if e.get("kind") != "shot":
            continue
        if not {"hole", "shot"} <= payload.keys():
            continue

        try:
            before = float(payload.get("distance_before_m", payload.get("before_m")))
            after = float(payload.get("distance_after_m", payload.get("after_m", 0.0)))
        except (TypeError, ValueError):
            continue

        lie_before = str(
            payload.get("lie_before", payload.get("before_lie", "fairway"))
        )
        lie_after = _infer_lie_after(payload, after, lie_before)
        penalty = payload.get("penalty", False)

        shots.append(
            ShotEvent(
                hole=int(payload["hole"]),
                shot=int(payload["shot"]),
                distance_before_m=before,
                distance_after_m=after,
                lie_before=lie_before,
                lie_after=lie_after,
                penalty=penalty,
            )
        )
    return shots


__all__ = ["compile_shot_events", "fingerprint", "run_events_snapshot"]
