from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from server.api.routers.uploads import _reset_state
from server.app import app


def test_finalize_is_atomic_under_concurrency():
    client = TestClient(app)
    payload = {"dedupeKey": "same-key-123", "clipMeta": {"len": 42}}

    _reset_state()

    def call():
        response = client.post("/api/uploads/finalize", json=payload)
        assert response.status_code == 200
        return response.json()["clipId"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: call(), range(2)))

    assert results[0] == results[1]

    _reset_state()
