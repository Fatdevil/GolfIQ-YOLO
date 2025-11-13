from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock
from time import time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from server.sg.compile import compile_shot_events
from server.sg.engine import compute_round_sg
from server.sg.schemas import HoleSG, ShotSG


@dataclass(slots=True)
class _CacheEntry:
    fingerprint: str
    value: "RunSG"
    expires_at: float


class RunSG(BaseModel):
    runId: str = Field(alias="runId")
    total_sg: float = Field(alias="total_sg")
    holes: list[HoleSG]
    shots: list[ShotSG] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class _RunSGCache:
    def __init__(self, cap: int = 256, ttl_seconds: float = 600.0) -> None:
        self._cap = max(1, int(cap))
        self._ttl = max(1.0, float(ttl_seconds))
        self._store: "OrderedDict[str, _CacheEntry]" = OrderedDict()
        self._lock = Lock()
        self.hit_count = 0
        self.miss_count = 0

    def _purge_if_expired(self, run_id: str, entry: _CacheEntry) -> bool:
        if entry.expires_at < time():
            self._store.pop(run_id, None)
            return True
        return False

    def get(self, run_id: str) -> Optional[RunSG]:
        with self._lock:
            entry = self._store.get(run_id)
            if entry is None or self._purge_if_expired(run_id, entry):
                return None
            self._store.move_to_end(run_id)
            self.hit_count += 1
            return entry.value

    def get_with_fingerprint(self, run_id: str, fingerprint: str) -> Optional[RunSG]:
        with self._lock:
            entry = self._store.get(run_id)
            if entry is None or self._purge_if_expired(run_id, entry):
                return None
            if entry.fingerprint != fingerprint:
                return None
            self._store.move_to_end(run_id)
            self.hit_count += 1
            return entry.value

    def set(self, run_id: str, fingerprint: str, value: RunSG) -> None:
        with self._lock:
            expires_at = time() + self._ttl
            self._store[run_id] = _CacheEntry(
                fingerprint=fingerprint, value=value, expires_at=expires_at
            )
            self._store.move_to_end(run_id)
            while len(self._store) > self._cap:
                self._store.popitem(last=False)

    def record_miss(self) -> None:
        with self._lock:
            self.miss_count += 1

    def stats(self) -> tuple[int, int]:
        with self._lock:
            return self.hit_count, self.miss_count


_CACHE = _RunSGCache()


def get_run_sg(run_id: str) -> Optional[RunSG]:
    return _CACHE.get(run_id)


def compute_and_cache_run_sg(run_id: str) -> RunSG:
    shots, fingerprint = compile_shot_events(run_id)

    cached = _CACHE.get_with_fingerprint(run_id, fingerprint)
    if cached is not None:
        return cached

    _CACHE.record_miss()

    if not shots:
        result = RunSG(runId=run_id, total_sg=0.0, holes=[], shots=[])
    else:
        total, holes, shot_details = compute_round_sg(shots)
        result = RunSG(runId=run_id, total_sg=total, holes=holes, shots=shot_details)

    _CACHE.set(run_id, fingerprint, result)
    return result


def cache_stats() -> tuple[int, int]:
    return _CACHE.stats()


def _reset_cache_for_tests() -> None:
    with _CACHE._lock:  # type: ignore[attr-defined]
        _CACHE._store.clear()  # type: ignore[attr-defined]
        _CACHE.hit_count = 0
        _CACHE.miss_count = 0


__all__ = [
    "RunSG",
    "cache_stats",
    "compute_and_cache_run_sg",
    "get_run_sg",
    "_reset_cache_for_tests",
]
