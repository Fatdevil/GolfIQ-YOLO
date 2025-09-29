from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_batch_202_and_count() -> None:
    client = TestClient(app)
    samples = [
        {"session_id": "session-batch", "ts": 1.0, "frame_id": 10},
        {"session_id": "session-batch", "ts": 2.0, "impact": True},
    ]

    response = client.post("/telemetry/batch", json=samples)
    assert response.status_code == 202
    assert response.json() == {"accepted": len(samples), "delivered": 0}
