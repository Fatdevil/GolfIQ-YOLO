from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream, viewer_token
from server.utils import media as media_utils
from server.telemetry import events as telemetry_events

client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-42"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "test-sign-key")
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("MEDIA_CDN_BASE_URL", raising=False)
    monkeypatch.delenv("MEDIA_ORIGIN_BASE_URL", raising=False)
    media_utils.reset_media_url_cache()
    yield
    live_stream.reset()
    media_utils.reset_media_url_cache()


@pytest.fixture
def telemetry_sink():
    captured: list[tuple[str, dict[str, object]]] = []

    def _emit(name: str, payload: dict[str, object]) -> None:
        captured.append((name, payload))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def test_admin_guard_and_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "super-secret")

    response = client.post("/events/event-1/live/start")
    assert response.status_code == 401

    response = client.post(
        "/events/event-1/live/start", headers={"x-api-key": "super-secret"}
    )
    assert response.status_code == 403

    response = client.post(
        "/events/event-1/live/start",
        headers={"x-api-key": "super-secret", **ADMIN_HEADERS},
    )
    assert response.status_code == 200


def test_mint_and_status_flow(
    telemetry_sink: list[tuple[str, dict[str, object]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    start = client.post("/events/event-2/live/start", headers=ADMIN_HEADERS)
    assert start.status_code == 200
    body = start.json()
    assert body["hlsPath"].startswith("/hls/")

    minted = client.post("/events/event-2/live/token", headers=ADMIN_HEADERS)
    assert minted.status_code == 200
    token_payload = minted.json()
    token = token_payload["token"]

    status_with_token = client.get(
        f"/events/event-2/live/status?token={token}",
        headers={"x-api-key": "optional"},
    )
    assert status_with_token.status_code == 200
    data = status_with_token.json()
    assert data["running"] is True
    assert data["hlsPath"].endswith("index.m3u8")

    status_without = client.get("/events/event-2/live/status")
    assert status_without.status_code == 200
    stripped = status_without.json()
    assert stripped["running"] is True
    assert "hlsPath" not in stripped

    monkeypatch.setattr(viewer_token, "time", lambda: token_payload["exp"] + 5)
    expired = client.get(f"/events/event-2/live/status?token={token}")
    assert expired.status_code == 200
    expired_data = expired.json()
    assert expired_data["running"] is True
    assert "hlsPath" not in expired_data

    events = {name for name, _ in telemetry_sink}
    assert "live.start" in events
    assert "live.token" in events
    assert "live.status" in events
    assert "live.viewer_join" in events


def test_missing_sign_key_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    client.post("/events/event-3/live/start", headers=ADMIN_HEADERS)
    monkeypatch.delenv("LIVE_VIEWER_SIGN_KEY", raising=False)
    response = client.post("/events/event-3/live/token", headers=ADMIN_HEADERS)
    assert response.status_code == 503
    assert response.json()["detail"] == "viewer token signing disabled"
