from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.api.routers import live_tokens
from server.services import live_state
from server.services import live_signing

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
    monkeypatch.setattr(live_tokens, "LIVE_SIGN_TTL", 120, raising=False)
    clock = {"now": 1_000}

    def _fake_now() -> int:
        return clock["now"]

    monkeypatch.setattr(live_signing, "_now_s", _fake_now, raising=False)
    yield clock
    live_state.reset()


def test_mint_requires_live_state(monkeypatch: pytest.MonkeyPatch):
    response = client.post("/api/events/event-1/live/viewer-token", headers=HEADERS)
    assert response.status_code == 400
    assert response.json()["detail"] == "event not live"


def test_mint_returns_signed_url(monkeypatch: pytest.MonkeyPatch, _setup):
    clock = _setup
    monkeypatch.setattr(live_state, "_now", lambda: 1_000, raising=False)
    live_state.upsert(
        "event-2",
        viewer_url="https://origin.example/hls/event-2/index.m3u8?quality=high",
        stream_id="stream-2",
    )

    response = client.post("/api/events/event-2/live/viewer-token", headers=HEADERS)
    assert response.status_code == 200
    payload = response.json()
    assert payload["ttlSec"] == 120
    assert payload["expTs"] == clock["now"] + 120

    parsed = urlparse(payload["viewerUrl"])
    assert parsed.scheme == "https"
    assert parsed.netloc == "cdn.example"
    assert parsed.path.endswith("/hls/event-2/index.m3u8")

    query = parse_qs(parsed.query)
    assert query["quality"] == ["high"]
    assert "sig" in query and len(query["sig"][0]) == 64
    assert query["exp"] == [str(payload["expTs"])]
