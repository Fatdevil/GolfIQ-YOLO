from pathlib import Path

from fastapi.testclient import TestClient

from server.app import app


def _sample() -> dict:
    return {
        "timestampMs": 1731200000000,
        "ts": 1731200000,
        "eventId": "evtA",
        "club": "7i",
        "ballSpeed": 62.1,
        "latencyMs": 12,
    }


def test_telemetry_no_record(monkeypatch):
    monkeypatch.delenv("FLIGHT_RECORDER_DIR", raising=False)
    with TestClient(app) as client:
        response = client.post("/telemetry", json=_sample())
        assert response.status_code == 200
        assert response.json()["accepted"] >= 1


def test_telemetry_record(tmp_path, monkeypatch):
    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "100.0")
    with TestClient(app) as client:
        response = client.post("/telemetry", json=_sample())
        assert response.status_code == 200

    files = list(Path(tmp_path).glob("*.jsonl"))
    assert files, "expected flight recorder file"
    assert files[0].read_text().strip(), "empty flight recorder"
