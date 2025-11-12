from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.api.routers import run_scores as run_scores_module
from server.app import app


@pytest.fixture(autouse=True)
def reset_state():
    run_scores_module._reset_state()
    yield
    run_scores_module._reset_state()


def test_score_event_idempotent_records_once():
    client = TestClient(app)
    body = {
        "dedupeKey": "dedupe-123",
        "ts": 1700000000.0,
        "kind": "swing",
        "payload": {"score": 5},
    }

    first = client.post("/api/runs/run-42/score", json=body)
    second = client.post("/api/runs/run-42/score", json=body)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == {"status": "ok", "dedupe": "dedupe-123"}
    assert run_scores_module._RECORDED_EVENTS["run-42"]["dedupe-123"]["payload"] == {
        "score": 5
    }
    assert len(run_scores_module._RECORDED_EVENTS["run-42"]) == 1
