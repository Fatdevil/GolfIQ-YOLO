from __future__ import annotations

from typing import List, Tuple

import pytest

from server.api.routers.run_scores import _RECORDED_EVENTS


@pytest.fixture
def seeded_run() -> str:
    run_id = "run-change"
    _RECORDED_EVENTS[run_id] = {
        "shot-1": {
            "ts": 10,
            "kind": "shot",
            "payload": {
                "hole": 1,
                "shot": 1,
                "before_m": 120,
                "after_m": 30,
                "before_lie": "tee",
                "penalty": None,
            },
        },
        "shot-2": {
            "ts": 20,
            "kind": "shot",
            "payload": {
                "hole": 1,
                "shot": 2,
                "before_m": 30,
                "after_m": 5,
                "before_lie": "fairway",
                "penalty": None,
            },
        },
    }
    return run_id


def test_cache_invalidates_on_change(client, monkeypatch, seeded_run):
    emitted: List[Tuple[str, dict]] = []

    def fake_emit(name: str, payload: dict) -> None:
        emitted.append((name, payload))

    monkeypatch.setattr("server.api.routers.sg.emit", fake_emit)

    import server.sg.engine as sg_engine

    compute_calls: list = []
    original_compute = sg_engine.compute_run_sg

    def wrapped_compute(shots):
        compute_calls.append(list(shots))
        return original_compute(shots)

    monkeypatch.setattr("server.api.routers.sg.compute_run_sg", wrapped_compute)

    first = client.get(f"/api/runs/{seeded_run}/sg")
    assert first.status_code == 200
    initial_body = first.json()
    assert len(initial_body["holes"]) == 1
    assert len(compute_calls) == 1

    # mutate existing shot payload to change fingerprint & totals
    _RECORDED_EVENTS[seeded_run]["shot-2"]["payload"]["after_m"] = 0

    emitted.clear()
    second = client.get(f"/api/runs/{seeded_run}/sg")
    assert second.status_code == 200
    updated_body = second.json()

    assert len(compute_calls) == 2
    assert updated_body != initial_body
    assert any(name == "sg.cache.miss" for name, _ in emitted)
