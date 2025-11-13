"""Lightweight adapters around the legacy anchor store with snake_case models."""

from __future__ import annotations

from threading import Lock
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

from server.schemas.anchors import AnchorIn as LegacyAnchorIn
from server.schemas.anchors import AnchorOut
from server.services.anchors_store import (
    create_or_confirm,
    get_one as legacy_get_one,
    list_run as legacy_list_run,
    patch_one,
)


class AnchorIn(BaseModel):
    hole: int
    shot: int
    clip_id: str = Field(alias="clip_id")
    t_start_ms: int = Field(alias="t_start_ms")
    t_end_ms: int = Field(alias="t_end_ms")

    model_config = ConfigDict(populate_by_name=True)


class Anchor(AnchorIn):
    run_id: str
    version: int
    created_ts: float
    updated_ts: float

    model_config = ConfigDict(populate_by_name=True)


_STORE: Dict[Tuple[str, int, int], Anchor] = {}
_LOCK = Lock()


def _key(run_id: str, hole: int, shot: int) -> Tuple[str, int, int]:
    return run_id, hole, shot


def _to_legacy(anchor: AnchorIn) -> LegacyAnchorIn:
    return LegacyAnchorIn(
        hole=anchor.hole,
        shot=anchor.shot,
        clipId=anchor.clip_id,
        tStartMs=anchor.t_start_ms,
        tEndMs=anchor.t_end_ms,
    )


def _from_legacy(record: AnchorOut) -> Anchor:
    return Anchor(
        run_id=record.runId,
        hole=record.hole,
        shot=record.shot,
        clip_id=record.clipId,
        t_start_ms=record.tStartMs,
        t_end_ms=record.tEndMs,
        version=record.version,
        created_ts=float(record.createdTs) / 1000.0,
        updated_ts=float(record.updatedTs) / 1000.0,
    )


def _store_anchor(anchor: Anchor) -> Anchor:
    with _LOCK:
        _STORE[_key(anchor.run_id, anchor.hole, anchor.shot)] = anchor
    return anchor


def upsert_anchors(run_id: str, anchors: List[AnchorIn]) -> List[Anchor]:
    results: List[Anchor] = []
    for anchor in anchors:
        legacy_payload = _to_legacy(anchor)
        try:
            stored, _created = create_or_confirm(run_id, legacy_payload)
        except ValueError:
            existing = legacy_get_one(run_id, anchor.hole, anchor.shot)
            if existing is None:
                stored, _ = create_or_confirm(run_id, legacy_payload)
            else:
                stored = patch_one(
                    run_id,
                    anchor.hole,
                    anchor.shot,
                    legacy_payload,
                    expected_version=existing.version,
                )
        results.append(_store_anchor(_from_legacy(stored)))

    results.sort(key=lambda item: (item.hole, item.shot))
    return results


def list_anchors(run_id: str) -> List[Anchor]:
    records = legacy_list_run(run_id)
    anchors = [_from_legacy(record) for record in records]
    for anchor in anchors:
        _store_anchor(anchor)
    return anchors


def get_anchor(run_id: str, hole: int, shot: int) -> Optional[Anchor]:
    record = legacy_get_one(run_id, hole, shot)
    if record is None:
        with _LOCK:
            return _STORE.get(_key(run_id, hole, shot))
    return _store_anchor(_from_legacy(record))


__all__ = ["Anchor", "AnchorIn", "get_anchor", "list_anchors", "upsert_anchors"]
