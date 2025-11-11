"""Representation-aware ETag behavior for /feed/home."""

from fastapi.testclient import TestClient
import pytest

from server.app import app
from server.routes import feed as feed_routes
from server.services import clips_repo, live_stream
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})
    live_stream.reset()
    feed_routes.reset_cache_for_tests()
    telemetry_events.set_events_telemetry_emitter(None)
    yield
    telemetry_events.set_events_telemetry_emitter(None)


def test_etag_same_limit_returns_304() -> None:
    first = client.get("/feed/home", params={"limit": 5})
    assert first.status_code == 200
    etag = first.headers.get("ETag")
    assert etag

    second = client.get(
        "/feed/home", params={"limit": 5}, headers={"If-None-Match": etag}
    )
    assert second.status_code == 304
    assert second.headers.get("ETag") == etag


def test_etag_different_limit_returns_200() -> None:
    first = client.get("/feed/home", params={"limit": 5})
    assert first.status_code == 200
    etag_5 = first.headers["ETag"]

    second = client.get(
        "/feed/home",
        params={"limit": 50},
        headers={"If-None-Match": etag_5},
    )
    assert second.status_code == 200
    etag_50 = second.headers["ETag"]
    assert etag_50 != etag_5
