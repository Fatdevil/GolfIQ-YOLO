"""Demo seed endpoint for S16 release."""

from __future__ import annotations

import os
import time
from typing import Dict, List, Union

from fastapi import APIRouter, Depends, HTTPException, status

from server.security import require_api_key
from server.api.routers.run_scores import _RECORDED_EVENTS, _RECORDED_EVENTS_LOCK
from server.services.anchors_store import create_or_confirm
from server.schemas.anchors import AnchorIn

router = APIRouter(dependencies=[Depends(require_api_key)])


def _enabled() -> bool:
    value = os.getenv("DEV_SEED_ENABLE", "")
    return value.strip().lower() in {"1", "true", "yes"}


@router.post("/api/dev/seed/s16")
def seed_s16() -> Dict[str, Union[str, List[str]]]:
    if not _enabled():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "disabled")

    event_id = "evt-s16-demo"
    run_ids = ["run-alice", "run-bob"]

    def _now_ms() -> int:
        return int(time.time() * 1000)

    demo = {
        "run-alice": [
            {
                "ts": _now_ms(),
                "kind": "shot",
                "payload": {
                    "hole": 1,
                    "shot": 1,
                    "before_m": 150,
                    "after_m": 8,
                    "before_lie": "fairway",
                },
            },
            {
                "ts": _now_ms() + 1000,
                "kind": "shot",
                "payload": {
                    "hole": 1,
                    "shot": 2,
                    "before_m": 8,
                    "after_m": 0,
                    "before_lie": "green",
                },
            },
        ],
        "run-bob": [
            {
                "ts": _now_ms(),
                "kind": "shot",
                "payload": {
                    "hole": 1,
                    "shot": 1,
                    "before_m": 120,
                    "after_m": 25,
                    "before_lie": "rough",
                },
            },
            {
                "ts": _now_ms() + 900,
                "kind": "shot",
                "payload": {
                    "hole": 1,
                    "shot": 2,
                    "before_m": 25,
                    "after_m": 2,
                    "before_lie": "green",
                },
            },
        ],
    }

    with _RECORDED_EVENTS_LOCK:
        for rid, items in demo.items():
            bucket = _RECORDED_EVENTS.setdefault(rid, {})
            for item in items:
                hole = item["payload"].get("hole")
                shot = item["payload"].get("shot")
                kind = item.get("kind", "")
                key = f"{kind}-{hole}-{shot}"
                bucket.setdefault(key, item)

    for rid in run_ids:
        clip_base = "clip-" + rid.split("-")[-1]
        create_or_confirm(
            rid,
            AnchorIn(
                hole=1,
                shot=1,
                clipId=f"{clip_base}-h1s1",
                tStartMs=500,
                tEndMs=6000,
            ),
        )
        create_or_confirm(
            rid,
            AnchorIn(
                hole=1,
                shot=2,
                clipId=f"{clip_base}-h1s2",
                tStartMs=0,
                tEndMs=4000,
            ),
        )

    return {"eventId": event_id, "runs": run_ids}


__all__ = ["router", "seed_s16"]
