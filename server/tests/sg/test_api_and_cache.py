from __future__ import annotations

from typing import List, Tuple

import pytest

from server.api.routers.run_scores import (
    _RECORDED_EVENTS,
    _reset_state as reset_run_events,
)
from server.services.sg_cache import _reset_cache_for_tests, cache_stats


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
    compute_calls: List[str] = []

    def wrapped_compute(target_run_id: str):
        compute_calls.append(target_run_id)
        return original_compute(target_run_id)

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
    assert compute_calls == [run_id]

    second = client.get(f"/api/runs/{run_id}/sg")
    assert second.status_code == 200
    assert second.json() == body_first

    hits, misses = cache_stats()
    assert hits == 1
    assert misses == 1
    assert compute_calls == [run_id]

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
