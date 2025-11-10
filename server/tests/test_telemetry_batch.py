from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_telemetry_batch_ok():
    payload = [
        {
            "session_id": "sess-1",
            "ts": 1731200000,
            "eventId": "evtA",
            "ballSpeed": 60.1,
        },
        {
            "session_id": "sess-1",
            "ts": 1731200001,
            "eventId": "evtA",
            "ballSpeed": 60.3,
        },
    ]
    response = client.post("/telemetry/batch", json=payload)
    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] >= 2
    assert body["delivered"] == 0


def test_telemetry_batch_empty_list():
    response = client.post("/telemetry/batch", json=[])
    assert response.status_code == 202
    body = response.json()
    assert body["accepted"] == 0
