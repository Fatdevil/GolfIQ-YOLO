"""ETag limit mismatch and lower clamp behavior for /feed/home."""

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


def test_limit_mismatch_returns_200_and_new_etag() -> None:
    first = client.get("/feed/home", params={"limit": 20})
    assert first.status_code == 200
    etag_20 = first.headers["ETag"]

    second = client.get(
        "/feed/home",
        params={"limit": 5},
        headers={"If-None-Match": etag_20},
    )
    assert second.status_code == 200
    assert second.headers["ETag"] != etag_20


def test_lower_bound_limit_is_clamped_to_min() -> None:
    response = client.get("/feed/home", params={"limit": 0})
    assert response.status_code == 200
    payload = response.json()
    assert "topShots" in payload
    assert isinstance(payload["topShots"], list)
