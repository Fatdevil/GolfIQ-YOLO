from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from server.api.routers.run_scores import _RECORDED_EVENTS, _reset_state
from server.app import app


def test_score_event_is_atomic_under_concurrency():
    client = TestClient(app)
    run_id = "run-1"
    body = {
        "dedupeKey": "same-evt-1",
        "ts": 123,
        "kind": "putt",
        "payload": {"strokes": 1},
    }

    _reset_state()

    def call():
        response = client.post(f"/api/runs/{run_id}/score", json=body)
        assert response.status_code == 200
        return response.json()["dedupe"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: call(), range(2)))

    assert results[0] == results[1]
    assert len(_RECORDED_EVENTS[run_id]) == 1

    _reset_state()
