"""Shape and Vary header checks for /feed/home."""

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


def test_shape_and_vary_header() -> None:
    response = client.get(
        "/feed/home",
        params={"limit": 5},
        headers={"Accept": "application/json"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload.get("topShots", []), list)
    assert isinstance(payload.get("live", []), list)
    assert "Vary" in response.headers
