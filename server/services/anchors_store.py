"""Thread-safe in-memory store for run shot time anchors."""

from __future__ import annotations

from threading import Lock
from time import time
from typing import Dict, Tuple

from server.schemas.anchors import AnchorIn, AnchorOut

_ANCHORS: Dict[Tuple[str, int, int], AnchorOut] = {}
_ANCHORS_LOCK = Lock()


def _key(run_id: str, hole: int, shot: int) -> Tuple[str, int, int]:
    return run_id, hole, shot


def list_run(run_id: str) -> list[AnchorOut]:
    with _ANCHORS_LOCK:
        return sorted(
            [anchor for (rid, _, _), anchor in _ANCHORS.items() if rid == run_id],
            key=lambda anchor: (anchor.hole, anchor.shot),
        )


def get_one(run_id: str, hole: int, shot: int) -> AnchorOut | None:
    with _ANCHORS_LOCK:
        return _ANCHORS.get(_key(run_id, hole, shot))


def create_or_confirm(run_id: str, anchor: AnchorIn) -> tuple[AnchorOut, bool]:
    key = _key(run_id, anchor.hole, anchor.shot)
    now = int(time() * 1000)
    with _ANCHORS_LOCK:
        existing = _ANCHORS.get(key)
        if existing:
            same_payload = (
                existing.clipId == anchor.clipId
                and existing.tStartMs == anchor.tStartMs
                and existing.tEndMs == anchor.tEndMs
            )
            if same_payload:
                return existing, False
            raise ValueError("conflict")

        created = AnchorOut(
            runId=run_id,
            hole=anchor.hole,
            shot=anchor.shot,
            clipId=anchor.clipId,
            tStartMs=anchor.tStartMs,
            tEndMs=anchor.tEndMs,
            version=1,
            ts=now,
        )
        _ANCHORS[key] = created
        return created, True


def patch_one(
    run_id: str,
    hole: int,
    shot: int,
    anchor: AnchorIn,
    *,
    expected_version: int,
) -> AnchorOut:
    if expected_version < 0:
        raise ValueError("expected_version must be >= 0")

    key = _key(run_id, hole, shot)
    now = int(time() * 1000)

    with _ANCHORS_LOCK:
        existing = _ANCHORS.get(key)
        if existing is None:
            if expected_version != 0:
                raise ValueError("version mismatch")
            created = AnchorOut(
                runId=run_id,
                hole=hole,
                shot=shot,
                clipId=anchor.clipId,
                tStartMs=anchor.tStartMs,
                tEndMs=anchor.tEndMs,
                version=1,
                ts=now,
            )
            _ANCHORS[key] = created
            return created

        if existing.version != expected_version:
            raise ValueError("version mismatch")

        existing.clipId = anchor.clipId
        existing.tStartMs = anchor.tStartMs
        existing.tEndMs = anchor.tEndMs
        existing.version += 1
        existing.ts = now
        return existing


def _reset_state() -> None:
    with _ANCHORS_LOCK:
        _ANCHORS.clear()


__all__ = [
    "_reset_state",
    "create_or_confirm",
    "get_one",
    "list_run",
    "patch_one",
]
