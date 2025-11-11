from pathlib import Path

import json
import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream

client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "admin-1"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "live-sign")
    yield tmp_path
    live_stream.reset()


def test_singleton_and_stop(tmp_path: Path) -> None:
    start_one = client.post("/events/single/live/start", headers=ADMIN_HEADERS)
    assert start_one.status_code == 200

    start_two = client.post("/events/single/live/start", headers=ADMIN_HEADERS)
    assert start_two.status_code == 409

    status_running = client.get("/events/single/live/status")
    assert status_running.status_code == 200
    assert status_running.json()["running"] is True

    stop = client.post("/events/single/live/stop", headers=ADMIN_HEADERS)
    assert stop.status_code == 200
    assert stop.json()["stopped"] is True

    status_stopped = client.get("/events/single/live/status")
    assert status_stopped.json()["running"] is False

    start_after_stop = client.post("/events/single/live/start", headers=ADMIN_HEADERS)
    assert start_after_stop.status_code == 200

    log_path = Path(tmp_path, "streams.jsonl")
    assert log_path.exists()
    entries = [
        json.loads(line)
        for line in log_path.read_text(encoding="utf-8").splitlines()
        if line
    ]
    actions = [entry["action"] for entry in entries]
    assert actions.count("start") == 2
    assert actions.count("stop") == 1
