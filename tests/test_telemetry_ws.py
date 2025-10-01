from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes.ws_telemetry import (
    ConnectionManager,
    _DEFAULT_FLIGHT_DIR,
    _dump_model,
    _flight_recorder_dir,
    _flight_recorder_pct,
)
from server.schemas.telemetry import Telemetry


def test_websocket_receives_published_event(monkeypatch) -> None:
    client = TestClient(app)
    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "0")

    payload = {
        "timestampMs": 123456,
        "club": "7i",
        "ballSpeed": 61.5,
        "clubSpeed": 72.0,
        "launchAngle": 14.2,
        "spinRpm": 3200,
        "carryMeters": 150.4,
    }

    with client.websocket_connect("/ws/telemetry") as websocket:
        response = client.post("/telemetry", json=payload)
        assert response.status_code == 200
        assert response.json()["delivered"] == 1

        message = websocket.receive_json()
        assert message == payload


def test_flight_recorder_writes_jsonl(monkeypatch, tmp_path: Path) -> None:
    client = TestClient(app)

    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "100")
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))

    payload = {"timestampMs": 987, "club": None, "ballSpeed": None}

    response = client.post("/telemetry", json=payload)
    assert response.status_code == 200
    assert response.json()["recorded"] is True

    files = list(tmp_path.glob("flight-*.jsonl"))
    assert len(files) == 1

    content = files[0].read_text(encoding="utf-8").strip().splitlines()
    assert len(content) == 1
    assert json.loads(content[0]) == {
        "timestampMs": 987,
        "club": None,
        "ballSpeed": None,
        "clubSpeed": None,
        "launchAngle": None,
        "spinRpm": None,
        "carryMeters": None,
    }


def test_dump_model_preserves_null_fields() -> None:
    payload = _dump_model(
        Telemetry(
            timestampMs=1,
            club=None,
            ballSpeed=None,
            clubSpeed=88.2,
            launchAngle=None,
            spinRpm=None,
            carryMeters=210.5,
        )
    )

    assert payload["clubSpeed"] == 88.2
    assert "club" in payload and payload["club"] is None


def test_flight_recorder_pct_invalid_default(monkeypatch) -> None:
    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "not-a-number")

    assert _flight_recorder_pct() == 5.0


def test_flight_recorder_dir_defaults(monkeypatch) -> None:
    monkeypatch.delenv("FLIGHT_RECORDER_DIR", raising=False)

    assert _flight_recorder_dir() == _DEFAULT_FLIGHT_DIR


@pytest.mark.anyio
async def test_connection_manager_drops_failed_sockets() -> None:
    manager = ConnectionManager()

    class DummySocket:
        def __init__(self, should_fail: bool = False) -> None:
            self.sent: list[dict[str, object]] = []
            self.should_fail = should_fail

        async def send_json(self, message: dict[str, object]) -> None:
            if self.should_fail:
                raise RuntimeError("boom")
            self.sent.append(message)

    good = DummySocket()
    bad = DummySocket(should_fail=True)

    manager._connections.add(good)  # type: ignore[attr-defined]
    manager._connections.add(bad)  # type: ignore[attr-defined]

    delivered = await manager.broadcast({"foo": "bar"})

    assert delivered == 1
    assert good.sent == [{"foo": "bar"}]
    assert len(manager._connections) == 1
