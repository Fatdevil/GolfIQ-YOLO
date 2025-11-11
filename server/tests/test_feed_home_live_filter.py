import os
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from server.app import app
from server.routes import feed as feed_routes
from server.services import clips_repo, live_stream


client = TestClient(app, raise_server_exceptions=False)


def setup_function() -> None:
    os.environ.pop("API_KEY", None)
    clips_repo._CLIP_STORE = {}  # type: ignore[attr-defined]
    live_stream.reset()
    feed_routes.reset_cache_for_tests()


def _seed_clip() -> None:
    clips_repo.register_clip(
        {
            "id": "clip-live",
            "event_id": "evt-live-a",
            "sg_delta": 0.3,
            "reactions_1min": 1,
            "reactions_total": 4,
            "anchors": [5.0],
            "created_at": "2024-01-05T09:00:00Z",
        }
    )


def test_feed_home_live_filter(monkeypatch):
    now = datetime(2024, 1, 5, 9, 30, tzinfo=timezone.utc)
    fake_time = SimpleNamespace(time=lambda: 1_700_002_000.0)
    monkeypatch.setattr(feed_routes, "_now", lambda: now)
    monkeypatch.setattr(feed_routes, "time", fake_time)

    _seed_clip()
    live_stream.start_live("evt-live-a")
    live_stream.start_live("evt-live-b")
    live_stream.stop_live("evt-live-b")  # ensure filtered

    response = client.get("/feed/home")
    assert response.status_code == 200
    payload = response.json()

    live_items = payload["live"]
    assert isinstance(live_items, list)
    assert len(live_items) == 1
    entry = live_items[0]
    assert entry["eventId"] == "evt-live-a"
    assert entry["livePath"].startswith("/hls/") or entry["livePath"].startswith(
        "/hls/mock"
    )
