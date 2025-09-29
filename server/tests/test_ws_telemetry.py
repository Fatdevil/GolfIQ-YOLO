from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_ws_connect_and_hello() -> None:
    client = TestClient(app)

    with client.websocket_connect("/ws/telemetry?session_id=session-123") as websocket:
        message = websocket.receive_json()
        assert message == {"type": "hello", "session_id": "session-123"}


def test_ws_broadcast_from_batch() -> None:
    client = TestClient(app)
    sample = {
        "session_id": "session-abc",
        "ts": 1717.0,
        "frame_id": 42,
        "ball": {"x": 1.0, "y": 2.0, "v": 3.5},
    }

    with (
        client.websocket_connect("/ws/telemetry?session_id=session-abc") as ws_one,
        client.websocket_connect("/ws/telemetry?session_id=session-abc") as ws_two,
    ):
        ws_one.receive_json()
        ws_two.receive_json()

        response = client.post("/telemetry/batch", json=[sample])
        assert response.status_code == 202
        assert response.json() == {"accepted": 1}

        received_one = ws_one.receive_json()
        received_two = ws_two.receive_json()

        expected_payload = dict(sample)
        expected_payload.setdefault("source", "arhud")
        assert received_one == expected_payload
        assert received_two == expected_payload
