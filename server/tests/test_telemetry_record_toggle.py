"""Coverage tests for telemetry flight recorder toggles."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def _sample_payload() -> dict[str, object]:
    return {
        "timestampMs": 1731200000,
        "eventId": "evtA",
        "club": "7i",
        "ballSpeed": 61.2,
    }


def test_telemetry_no_record(monkeypatch):
    """Flight recorder disabled should not write files."""

    monkeypatch.delenv("FLIGHT_RECORDER_DIR", raising=False)
    response = client.post("/telemetry", json=_sample_payload())
    assert response.status_code == 200
    assert response.json()["accepted"] >= 1


def test_telemetry_record(tmp_path, monkeypatch):
    """Flight recorder enabled should write telemetry to disk."""

    monkeypatch.setenv("FLIGHT_RECORDER_DIR", str(tmp_path))
    monkeypatch.setenv("FLIGHT_RECORDER_PCT", "100.0")
    response = client.post("/telemetry", json=_sample_payload())
    assert response.status_code == 200
    files = list(Path(tmp_path).glob("*.jsonl"))
    assert files, "expected telemetry file to be written"
    assert files[0].read_text().strip()
