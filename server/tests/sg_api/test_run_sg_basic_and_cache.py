from __future__ import annotations

from typing import List, Tuple

import pytest

from server.api.routers.run_scores import _RECORDED_EVENTS


@pytest.fixture
def seeded_run() -> str:
    run_id = "run-basic"
    _RECORDED_EVENTS[run_id] = {
        "shot-1": {
            "ts": 1,
            "kind": "shot",
            "payload": {
                "hole": 1,
                "shot": 1,
                "before_m": 150,
                "after_m": 10,
                "before_lie": "tee",
                "penalty": None,
            },
        },
        "shot-2": {
            "ts": 2,
            "kind": "shot",
            "payload": {
                "hole": 1,
                "shot": 2,
                "before_m": 10,
                "after_m": 1,
                "before_lie": "green",
                "penalty": None,
            },
        },
    }
    return run_id


def test_basic_run_uses_cache(client, monkeypatch, seeded_run):
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
    assert compute_calls
    body_first = first.json()
    assert body_first["holes"]

    # miss + calc telemetry on first request
    assert emitted[0][0] == "sg.cache.miss"
    assert emitted[0][1]["runId"] == seeded_run
    assert emitted[0][1]["shots"] == 2
    assert emitted[1][0] == "sg.calc.ms"

    second = client.get(f"/api/runs/{seeded_run}/sg")
    assert second.status_code == 200
    assert second.json() == body_first

    # ensure compute not invoked again
    assert len(compute_calls) == 1
    assert emitted[-1][0] == "sg.cache.hit"
    assert emitted[-1][1]["runId"] == seeded_run
