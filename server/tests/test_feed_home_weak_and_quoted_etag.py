"""Weak and quoted ETag handling for /feed/home."""

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


def test_weak_and_quoted_etag_match_304() -> None:
    first = client.get("/feed/home", params={"limit": 10})
    assert first.status_code == 200
    etag = first.headers["ETag"]
    weak = "W/" + etag
    quoted = etag.strip('"')

    for header_value in (weak, quoted):
        second = client.get(
            "/feed/home",
            params={"limit": 10},
            headers={"If-None-Match": header_value},
        )
        assert second.status_code == 304


def test_weak_etag_with_different_limit_is_200() -> None:
    first = client.get("/feed/home", params={"limit": 10})
    weak = "W/" + first.headers["ETag"]

    second = client.get(
        "/feed/home",
        params={"limit": 30},
        headers={"If-None-Match": weak},
    )
    assert second.status_code == 200
