from __future__ import annotations

from typing import Generator

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import live as live_routes
from server.services import live_state
from server.utils import media as media_utils


client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "member-1"}


@pytest.fixture(autouse=True)
def _reset_live_state(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    live_state.reset()
    monkeypatch.setattr(live_routes, "LIVE_HEARTBEAT_TTL_SEC", 10, raising=False)
    monkeypatch.setattr(live_routes, "LIVE_LATENCY_MODE", "ll-hls", raising=False)
    monkeypatch.delenv("MEDIA_CDN_BASE_URL", raising=False)
    monkeypatch.delenv("MEDIA_ORIGIN_BASE_URL", raising=False)
    monkeypatch.delenv("MEDIA_CDN_REWRITE_HOSTS", raising=False)
    media_utils.reset_media_url_cache()
    yield
    live_state.reset()
    media_utils.reset_media_url_cache()


def test_heartbeat_sets_live_and_ttl_expiry(monkeypatch: pytest.MonkeyPatch) -> None:
    base_time = 1_000
    monkeypatch.setattr(live_state, "_now", lambda: base_time)

    response = client.post(
        "/events/event-1/live/heartbeat",
        json={"streamId": "stream-1", "viewerUrl": "https://media.example/live.m3u8"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["isLive"] is True
    assert body["streamId"] == "stream-1"
    assert body["startedTs"] == base_time

    monkeypatch.setattr(
        live_state, "_now", lambda: base_time + live_routes.LIVE_HEARTBEAT_TTL_SEC - 1
    )
    still_live = client.get("/events/event-1/live")
    assert still_live.status_code == 200
    assert still_live.json()["isLive"] is True

    monkeypatch.setattr(
        live_state, "_now", lambda: base_time + live_routes.LIVE_HEARTBEAT_TTL_SEC + 5
    )
    expired = client.get("/events/event-1/live")
    assert expired.status_code == 200
    payload = expired.json()
    assert payload["isLive"] is False
    assert payload["viewerUrl"] is None
    assert payload["streamId"] is None
    assert payload["startedTs"] is None


def test_stop_is_immediate_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    base_time = 2_000
    monkeypatch.setattr(live_state, "_now", lambda: base_time)

    heartbeat = client.post(
        "/events/event-55/live/heartbeat",
        json={"streamId": "stream-55", "viewerUrl": "https://media.example/live.m3u8"},
        headers=ADMIN_HEADERS,
    )
    assert heartbeat.status_code == 200
    data = heartbeat.json()
    assert data["isLive"] is True
    assert data["updatedTs"] == base_time

    live_state.mark_offline("event-55")

    monkeypatch.setattr(live_state, "_now", lambda: base_time + 1)
    state = client.get("/events/event-55/live")
    assert state.status_code == 200
    payload = state.json()
    assert payload["isLive"] is False
    assert payload["viewerUrl"] is None
    assert payload["updatedTs"] == base_time
    assert payload["streamId"] is None
    assert payload["startedTs"] is None


def test_heartbeat_after_stop_clears_offline(monkeypatch: pytest.MonkeyPatch) -> None:
    base_time = 5_000
    monkeypatch.setattr(live_state, "_now", lambda: base_time)

    live_state.mark_offline("event-77")

    offline = client.get("/events/event-77/live")
    assert offline.status_code == 200
    assert offline.json()["isLive"] is False

    monkeypatch.setattr(live_state, "_now", lambda: base_time + 5)
    heartbeat = client.post(
        "/events/event-77/live/heartbeat",
        json={"streamId": "stream-77", "viewerUrl": "https://media.example/live.m3u8"},
        headers=ADMIN_HEADERS,
    )
    assert heartbeat.status_code == 200
    data = heartbeat.json()
    assert data["isLive"] is True
    assert data["updatedTs"] == base_time + 5
    assert data["streamId"] == "stream-77"

    current = client.get("/events/event-77/live")
    assert current.status_code == 200
    assert current.json()["isLive"] is True


def test_viewer_url_rewritten_and_preserves_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MEDIA_ORIGIN_BASE_URL", "https://origin.example")
    monkeypatch.setenv("MEDIA_CDN_BASE_URL", "https://cdn.example")
    monkeypatch.setenv("MEDIA_CDN_REWRITE_HOSTS", "origin.example")
    media_utils.reset_media_url_cache()

    monkeypatch.setattr(live_state, "_now", lambda: 5_000)
    response = client.post(
        "/events/event-9/live/heartbeat",
        json={
            "streamId": "stream-9",
            "viewerUrl": "https://origin.example/live/master.m3u8?token=abc",
        },
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["viewerUrl"] == "https://cdn.example/live/master.m3u8?token=abc"

    # Update with a viewer URL that should not be rewritten
    response = client.post(
        "/events/event-9/live/heartbeat",
        json={
            "streamId": "stream-9",
            "viewerUrl": "https://other.example/live/master.m3u8?token=def",
        },
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["viewerUrl"] == "https://other.example/live/master.m3u8?token=def"
