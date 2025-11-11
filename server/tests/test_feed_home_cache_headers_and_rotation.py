"""Cache header and snapshot rotation tests for /feed/home."""

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


def test_cache_headers_present() -> None:
    response = client.get("/feed/home", params={"limit": 15})
    assert response.status_code == 200
    assert "Cache-Control" in response.headers
    assert "max-age" in response.headers["Cache-Control"]
    assert "ETag" in response.headers


def test_etag_rotates_when_snapshot_changes(monkeypatch: pytest.MonkeyPatch) -> None:
    first = client.get("/feed/home", params={"limit": 15})
    assert first.status_code == 200
    etag_initial = first.headers["ETag"]

    class _FakeSnapshot:
        etag = "rotated/etag"

        def as_payload(self, limit: int) -> dict[str, object]:
            return {
                "topShots": [],
                "live": [],
                "updatedAt": "2030-01-01T00:00:00Z",
                "etag": self.etag,
            }

    monkeypatch.setattr(
        feed_routes, "_get_snapshot", lambda: _FakeSnapshot(), raising=True
    )

    second = client.get(
        "/feed/home",
        params={"limit": 15},
        headers={"If-None-Match": etag_initial},
    )
    assert second.status_code == 200
    assert second.headers["ETag"] != etag_initial
