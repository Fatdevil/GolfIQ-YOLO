from __future__ import annotations

import time
from typing import List, Tuple

import pytest

from server.api.routers.run_scores import (
    _RECORDED_EVENTS,
    _reset_state as reset_run_events,
)
from server.sg.schemas import ShotEvent
from server.services.sg_cache import (
    _reset_cache_for_tests,
    cache_stats,
    compute_and_cache_run_sg,
    compute_shots_fingerprint,
)


@pytest.fixture(autouse=True)
def _clear_state() -> None:
    reset_run_events()
    _reset_cache_for_tests()


def _seed_run(run_id: str) -> None:
    _RECORDED_EVENTS[run_id] = {
        "shot-1": {
            "ts": 1,
            "kind": "shot",
            "payload": {
                "hole": 1,
                "shot": 1,
                "distance_before_m": 150.0,
                "distance_after_m": 12.0,
                "lie_before": "tee",
                "lie_after": "fairway",
            },
        },
        "shot-2": {
            "ts": 2,
            "kind": "shot",
            "payload": {
                "hole": 1,
                "shot": 2,
                "distance_before_m": 12.0,
                "distance_after_m": 0.0,
                "lie_before": "green",
                "lie_after": "holed",
            },
        },
    }


def test_run_sg_cached(client, monkeypatch):
    run_id = "run-basic"
    _seed_run(run_id)

    emitted: List[Tuple[str, dict]] = []

    def fake_emit(name: str, payload: dict) -> None:
        emitted.append((name, payload))

    monkeypatch.setattr("server.api.routers.sg.emit", fake_emit)

    import server.services.sg_cache as sg_cache_module

    original_compute = sg_cache_module.compute_and_cache_run_sg
    compute_calls: List[Tuple[str, str, int]] = []

    def wrapped_compute(target_run_id: str, shots, fingerprint: str):
        compute_calls.append((target_run_id, fingerprint, len(shots)))
        return original_compute(target_run_id, shots, fingerprint)

    monkeypatch.setattr(
        "server.api.routers.sg.compute_and_cache_run_sg", wrapped_compute
    )

    first = client.get(f"/api/runs/{run_id}/sg")
    assert first.status_code == 200
    body_first = first.json()
    assert body_first["runId"] == run_id
    assert body_first["holes"]

    hits, misses = cache_stats()
    assert hits == 0
    assert misses == 1
    assert compute_calls and compute_calls[0][0] == run_id

    second = client.get(f"/api/runs/{run_id}/sg")
    assert second.status_code == 200
    assert second.json() == body_first

    hits, misses = cache_stats()
    assert hits == 1
    assert misses == 1
    assert len(compute_calls) == 1

    names = [name for name, _ in emitted]
    assert names.count("sg.cache.miss") == 1
    assert names.count("sg.cache.hit") == 1
    assert any(name == "sg.compute.ms" for name in names)


def test_missing_run_returns_zero(client, monkeypatch):
    run_id = "no-data"
    emitted: List[Tuple[str, dict]] = []

    monkeypatch.setattr(
        "server.api.routers.sg.emit",
        lambda name, payload: emitted.append((name, payload)),
    )

    response = client.get(f"/api/runs/{run_id}/sg")
    assert response.status_code == 200
    body = response.json()
    assert body["runId"] == run_id
    assert body["total_sg"] == pytest.approx(0.0)
    assert body["holes"] == []

    names = [name for name, _ in emitted]
    assert names.count("sg.cache.miss") == 1
    assert any(name == "sg.compute.ms" for name in names)


def test_run_sg_cache_invalidation_on_new_shot(client, monkeypatch):
    run_id = "run-cache-invalidation"
    _seed_run(run_id)

    emitted: List[Tuple[str, dict]] = []

    def fake_emit(name: str, payload: dict) -> None:
        emitted.append((name, payload))

    monkeypatch.setattr("server.api.routers.sg.emit", fake_emit)

    first = client.get(f"/api/runs/{run_id}/sg")
    assert first.status_code == 200
    total_before = first.json()["total_sg"]

    _RECORDED_EVENTS[run_id]["shot-3"] = {
        "ts": 3,
        "kind": "shot",
        "payload": {
            "hole": 2,
            "shot": 1,
            "distance_before_m": 80.0,
            "distance_after_m": 2.0,
            "lie_before": "fairway",
            "lie_after": "green",
        },
    }

    second = client.get(f"/api/runs/{run_id}/sg")
    assert second.status_code == 200
    total_after = second.json()["total_sg"]

    assert total_after != total_before

    hits, misses = cache_stats()
    assert hits == 0
    assert misses == 2

    names = [name for name, _ in emitted]
    assert names.count("sg.cache.hit") == 0
    assert names.count("sg.cache.miss") == 2


def test_compute_shots_fingerprint_stability():
    shot_one = ShotEvent(
        hole=1,
        shot=1,
        distance_before_m=150.0,
        distance_after_m=25.0,
        lie_before="tee",
        lie_after="fairway",
        penalty=False,
    )
    shot_two = ShotEvent(
        hole=1,
        shot=2,
        distance_before_m=25.0,
        distance_after_m=4.0,
        lie_before="fairway",
        lie_after="green",
        penalty=False,
    )

    base = compute_shots_fingerprint([shot_one, shot_two])
    same = compute_shots_fingerprint([shot_one, shot_two])
    swapped = compute_shots_fingerprint([shot_two, shot_one])

    assert base == same == swapped

    shot_three = ShotEvent(
        hole=2,
        shot=1,
        distance_before_m=12.0,
        distance_after_m=0.0,
        lie_before="green",
        lie_after="holed",
        penalty=False,
    )

    appended = compute_shots_fingerprint([shot_one, shot_two, shot_three])
    assert appended != base

    penalty_change = compute_shots_fingerprint(
        [shot_one, shot_two.model_copy(update={"penalty": True})]
    )
    assert penalty_change != base


def test_compute_and_cache_run_sg_returns_cached_result():
    run_id = "direct-cache-hit"
    shots = [
        ShotEvent(
            hole=1,
            shot=1,
            distance_before_m=100.0,
            distance_after_m=10.0,
            lie_before="fairway",
            lie_after="green",
            penalty=False,
        ),
        ShotEvent(
            hole=1,
            shot=2,
            distance_before_m=10.0,
            distance_after_m=0.0,
            lie_before="green",
            lie_after="holed",
            penalty=False,
        ),
    ]

    fingerprint = compute_shots_fingerprint(shots)
    first = compute_and_cache_run_sg(run_id, shots, fingerprint)
    assert first.runId == run_id

    hits, misses = cache_stats()
    assert hits == 0
    assert misses == 1

    second = compute_and_cache_run_sg(run_id, list(shots), fingerprint)
    assert second is first

    hits_after, misses_after = cache_stats()
    assert hits_after == 1
    assert misses_after == 1


def test_get_run_sg_respects_entry_expiration():
    run_id = "expired-cache"
    shots = [
        ShotEvent(
            hole=3,
            shot=1,
            distance_before_m=60.0,
            distance_after_m=20.0,
            lie_before="rough",
            lie_after="fairway",
            penalty=False,
        )
    ]

    fingerprint = compute_shots_fingerprint(shots)
    compute_and_cache_run_sg(run_id, shots, fingerprint)

    import server.services.sg_cache as sg_cache_module

    entry = sg_cache_module._CACHE._store[run_id]  # type: ignore[attr-defined]
    entry.expires_at = time.time() - 1  # type: ignore[attr-defined]

    assert sg_cache_module.get_run_sg(run_id, fingerprint) is None
    assert run_id not in sg_cache_module._CACHE._store  # type: ignore[attr-defined]


def test_cache_eviction_removes_oldest_entry():
    import server.services.sg_cache as sg_cache_module

    cache = sg_cache_module._RunSGCache(cap=1, ttl_seconds=60)
    first = sg_cache_module.RunSG(runId="r1", total_sg=0.0, holes=[], shots=[])
    second = sg_cache_module.RunSG(runId="r2", total_sg=0.0, holes=[], shots=[])

    cache.set("r1", "fp1", first)
    cache.set("r2", "fp2", second)

    assert "r1" not in cache._store  # type: ignore[attr-defined]
    assert "r2" in cache._store  # type: ignore[attr-defined]
