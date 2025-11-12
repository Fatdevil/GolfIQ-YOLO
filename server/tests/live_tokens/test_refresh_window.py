from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.api.routers import live_tokens
from server.services import live_state, live_signing

client = TestClient(app, raise_server_exceptions=False)
HEADERS = {"x-api-key": "secret"}


@pytest.fixture(autouse=True)
def _setup(monkeypatch: pytest.MonkeyPatch):
    live_state.reset()
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")
    monkeypatch.setenv("MEDIA_ORIGIN_BASE_URL", "https://origin.example")
    monkeypatch.setenv("MEDIA_CDN_BASE_URL", "https://cdn.example")
    monkeypatch.setattr(live_tokens, "LIVE_SIGN_SECRET", "unit-secret", raising=False)
    monkeypatch.setattr(live_tokens, "LIVE_SIGN_TTL", 90, raising=False)
    clock = {"now": 2_000}

    def _fake_now() -> int:
        return clock["now"]

    monkeypatch.setattr(live_signing, "_now_s", _fake_now, raising=False)
    yield clock
    live_state.reset()


def test_refresh_skips_when_sufficient_time(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(live_tokens.time, "time", lambda: 1_000, raising=False)
    response = client.get(
        "/api/events/event-3/live/refresh",
        params={"expTs": 1_200, "minRemainingSec": 30},
        headers=HEADERS,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload == {"viewerUrl": "", "expTs": 1_200, "refreshed": False}


def test_refresh_mints_new_token_when_window_small(
    monkeypatch: pytest.MonkeyPatch, _setup
):
    clock = _setup
    clock["now"] = 1_100
    monkeypatch.setattr(live_tokens.time, "time", lambda: 1_100, raising=False)
    monkeypatch.setattr(live_state, "_now", lambda: 1_100, raising=False)

    live_state.upsert(
        "event-4",
        viewer_url="https://origin.example/hls/event-4/master.m3u8",
    )

    response = client.get(
        "/api/events/event-4/live/refresh",
        params={"expTs": 1_120, "minRemainingSec": 30},
        headers=HEADERS,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["refreshed"] is True
    assert payload["expTs"] == clock["now"] + 90
    assert payload["viewerUrl"].startswith("https://cdn.example/")
