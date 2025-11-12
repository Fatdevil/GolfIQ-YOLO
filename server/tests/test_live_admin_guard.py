from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as live_routes
from server.services import live_state


client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "admin-1"}


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    live_state.reset()
    monkeypatch.setattr(live_routes, "LIVE_HEARTBEAT_TTL_SEC", 10, raising=False)
    monkeypatch.setattr(live_routes, "LIVE_LATENCY_MODE", "ll-hls", raising=False)


def test_heartbeat_requires_admin_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")

    response = client.post("/events/event-7/live/heartbeat")
    assert response.status_code == 401

    response = client.post(
        "/events/event-7/live/heartbeat",
        headers={"x-api-key": "secret"},
    )
    assert response.status_code == 403

    ok = client.post(
        "/events/event-7/live/heartbeat",
        headers={"x-api-key": "secret", **ADMIN_HEADERS},
        json={"viewerUrl": "https://origin.example/live/index.m3u8"},
    )
    assert ok.status_code == 200
    payload = ok.json()
    assert payload["isLive"] is True
    assert payload["viewerUrl"] == "https://origin.example/live/index.m3u8"


def test_stop_marks_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(live_state, "_now", lambda: 100)
    client.post(
        "/events/event-8/live/heartbeat",
        headers=ADMIN_HEADERS,
        json={"streamId": "stream-8"},
    )

    client.post(
        "/events/event-8/live/stop",
        headers=ADMIN_HEADERS,
    )

    monkeypatch.setattr(live_state, "_now", lambda: 200)
    state = client.get("/events/event-8/live")
    assert state.status_code == 200
    data = state.json()
    assert data["isLive"] is False
    assert data["streamId"] is None
