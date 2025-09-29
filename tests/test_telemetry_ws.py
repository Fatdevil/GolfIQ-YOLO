from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from server.app import app


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
