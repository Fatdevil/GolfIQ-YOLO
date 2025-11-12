from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Tuple

from ..api.routers.run_scores import _RECORDED_EVENTS

from .schemas import ShotEvent


def run_events_snapshot(run_id: str) -> list[dict]:
    events_for_run: Dict[str, Dict[str, Any]] = _RECORDED_EVENTS.get(run_id, {})
    return sorted(
        events_for_run.values(),
        key=lambda e: (e.get("ts", 0), json.dumps(e, sort_keys=True)),
    )


def fingerprint(events: list[dict]) -> str:
    return hashlib.sha1(
        json.dumps(events, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def compile_shot_events(run_id: str) -> Tuple[list[ShotEvent], str]:
    events = run_events_snapshot(run_id)
    shots: List[ShotEvent] = []
    for e in events:
        payload = e.get("payload") or {}
        if e.get("kind") != "shot":
            continue
        if not {"hole", "shot", "before_m", "after_m", "before_lie"} <= payload.keys():
            continue
        shots.append(
            ShotEvent(
                hole=int(payload["hole"]),
                shot=int(payload["shot"]),
                ts=int(e.get("ts", 0)),
                before_m=float(payload["before_m"]),
                after_m=float(payload["after_m"]),
                before_lie=str(payload["before_lie"]),
                penalty=payload.get("penalty"),
            )
        )
    return shots, fingerprint(events)


__all__ = ["compile_shot_events", "fingerprint", "run_events_snapshot"]
