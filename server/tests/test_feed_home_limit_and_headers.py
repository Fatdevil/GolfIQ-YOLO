"""Header and limit clamp verification for /feed/home."""

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


def test_limit_is_clamped_and_headers_present() -> None:
    response = client.get("/feed/home", params={"limit": 9999})
    assert response.status_code == 200
    payload = response.json()
    assert "topShots" in payload and "live" in payload

    cache_control = response.headers.get("Cache-Control")
    etag_header = response.headers.get("ETag")
    assert cache_control and "max-age" in cache_control
    assert etag_header and etag_header.startswith('"') and etag_header.endswith('"')

    rep_etag = etag_header.strip('"')
    snapshot_etag, _, limit_token = rep_etag.partition(";limit=")
    assert snapshot_etag == payload["etag"]
    assert limit_token == "50"
