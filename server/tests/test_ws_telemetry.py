from __future__ import annotations

import asyncio

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from server.app import app
from server.routes import ws_telemetry
from server.schemas.telemetry import TelemetrySample


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
        assert response.json() == {"accepted": 1, "delivered": 2}

        received_one = ws_one.receive_json()
        received_two = ws_two.receive_json()

        expected_payload = dict(sample)
        expected_payload.setdefault("source", "arhud")
        assert received_one == expected_payload
        assert received_two == expected_payload


def test_ws_rejects_missing_session_id() -> None:
    client = TestClient(app)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect("/ws/telemetry"):
            pass

    assert excinfo.value.code == status.WS_1008_POLICY_VIOLATION


def test_ws_disconnect_cleans_hub() -> None:
    client = TestClient(app)
    session_id = "session-cleanup"

    with client.websocket_connect(
        f"/ws/telemetry?session_id={session_id}"
    ) as websocket:
        websocket.receive_json()
        websocket.close()

    assert session_id not in ws_telemetry._telemetry_ws_hub


def test_broadcast_drops_failed_clients() -> None:
    class FailingWebSocket:
        def __init__(self) -> None:
            self.closed = False

        def __hash__(self) -> int:  # pragma: no cover - deterministic hash
            return id(self)

        async def send_json(
            self, payload: object
        ) -> None:  # pragma: no cover - async API contract
            raise RuntimeError("boom")

    session_id = "session-failure"
    failing_ws = FailingWebSocket()
    ws_telemetry._telemetry_ws_hub[session_id].add(failing_ws)  # type: ignore[arg-type]

    sample = TelemetrySample(session_id=session_id, ts=1.0)

    try:
        delivered = asyncio.run(ws_telemetry._broadcast_to_clients(sample))
    finally:
        ws_telemetry._telemetry_ws_hub.pop(session_id, None)

    assert delivered == 0
    assert session_id not in ws_telemetry._telemetry_ws_hub


def test_serialize_sample_falls_back_to_dict() -> None:
    class LegacySample:
        def __init__(self, session_id: str) -> None:
            self.session_id = session_id

        def dict(self, *, exclude_none: bool = True) -> dict:
            return {"session_id": self.session_id, "ts": 2.5}

    legacy_sample = LegacySample("legacy-session")

    payload = ws_telemetry._serialize_sample(legacy_sample)  # type: ignore[arg-type]

    assert payload == {"session_id": "legacy-session", "ts": 2.5}


def test_remove_client_clears_empty_session() -> None:
    session_id = "session-remove"
    dummy_ws = object()
    ws_telemetry._telemetry_ws_hub[session_id].add(dummy_ws)  # type: ignore[arg-type]

    try:
        ws_telemetry._remove_client(session_id, dummy_ws)  # type: ignore[arg-type]
    finally:
        ws_telemetry._telemetry_ws_hub.pop(session_id, None)

    assert session_id not in ws_telemetry._telemetry_ws_hub
