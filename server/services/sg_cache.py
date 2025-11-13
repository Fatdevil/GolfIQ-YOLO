from __future__ import annotations

import hashlib
import json
from typing import Iterable, Optional

from server.sg.cache import RunSGCache
from server.sg.engine import compute_round_sg
from server.sg.schemas import RunSG, ShotEvent

_CACHE = RunSGCache()


def compute_shots_fingerprint(shots: Iterable[ShotEvent]) -> str:
    canonical: list[tuple] = []
    for shot in shots:
        data = shot.model_dump(mode="python")
        canonical.append(
            (
                int(data["hole"]),
                int(data["shot"]),
                float(data["distance_before_m"]),
                float(data["distance_after_m"]),
                str(data.get("lie_before", "")).strip().lower(),
                str(data.get("lie_after", "")).strip().lower(),
                json.dumps(data.get("penalty", False), sort_keys=True),
            )
        )

    canonical.sort()
    raw = json.dumps(canonical, separators=(",", ":"))
    return hashlib.sha1(raw.encode()).hexdigest()


def get_run_sg(run_id: str, fingerprint: str) -> Optional[RunSG]:
    return _CACHE.get(run_id, fingerprint=fingerprint)


def compute_and_cache_run_sg(
    run_id: str, shots: list[ShotEvent], fingerprint: str
) -> RunSG:
    cached = _CACHE.get(run_id, fingerprint=fingerprint)
    if cached is not None:
        return cached

    _CACHE.record_miss()

    if not shots:
        result = RunSG(run_id=run_id, sg_total=0.0, holes=[], shots=[])
    else:
        total, holes, shot_details = compute_round_sg(shots)
        result = RunSG(run_id=run_id, sg_total=total, holes=holes, shots=shot_details)

    _CACHE.put(run_id, result, fingerprint=fingerprint)
    return result


def cache_stats() -> tuple[int, int]:
    return _CACHE.stats()


def _reset_cache_for_tests() -> None:
    _CACHE.clear()


__all__ = [
    "RunSG",
    "cache_stats",
    "compute_and_cache_run_sg",
    "compute_shots_fingerprint",
    "get_run_sg",
    "_reset_cache_for_tests",
]
