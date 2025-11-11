import os
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from server.app import app
from server.routes import feed as feed_routes
from server.services import clips_repo, live_stream
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)


def setup_function() -> None:  # noqa: D401
    """Reset shared state between tests."""

    os.environ.pop("API_KEY", None)
    clips_repo._CLIP_STORE = {}  # type: ignore[attr-defined]
    live_stream.reset()
    feed_routes.reset_cache_for_tests()
    telemetry_events.set_events_telemetry_emitter(None)


def teardown_function() -> None:
    telemetry_events.set_events_telemetry_emitter(None)


def _seed_clip() -> None:
    clips_repo.register_clip(
        {
            "id": "clip-etag",
            "event_id": "evt-home",
            "sg_delta": 0.42,
            "reactions_1min": 2,
            "reactions_total": 12,
            "anchors": [4.0],
            "created_at": "2024-01-04T10:00:00Z",
        }
    )


def test_feed_home_etag_and_ttl(monkeypatch):
    now = datetime(2024, 1, 4, 10, 30, tzinfo=timezone.utc)
    fake_time = SimpleNamespace(time=lambda: 1_700_001_000.0)
    monkeypatch.setattr(feed_routes, "_now", lambda: now)
    monkeypatch.setattr(feed_routes, "time", fake_time)

    _seed_clip()

    response = client.get("/feed/home")
    assert response.status_code == 200
    etag = response.headers["etag"]
    payload = response.json()
    assert payload["etag"] == etag

    cached = client.get("/feed/home", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    assert cached.headers["etag"] == etag
