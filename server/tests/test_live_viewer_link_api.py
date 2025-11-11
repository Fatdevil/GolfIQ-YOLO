from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-7"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "test-sign-key")
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    yield
    live_stream.reset()


@pytest.fixture
def telemetry_sink():
    captured: list[tuple[str, dict[str, object]]] = []

    def _emit(name: str, payload: dict[str, object]) -> None:
        captured.append((name, payload))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def test_viewer_link_requires_running_stream() -> None:
    response = client.get("/events/event-link/live/viewer_link", headers=ADMIN_HEADERS)
    assert response.status_code == 409


def test_viewer_link_requires_admin_headers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WEB_BASE_URL", "https://web.example")
    start = client.post("/events/event-link/live/start", headers=ADMIN_HEADERS)
    assert start.status_code == 200

    response = client.get("/events/event-link/live/viewer_link")
    assert response.status_code == 403


def test_viewer_link_returns_url_and_emits_telemetry(
    monkeypatch: pytest.MonkeyPatch, telemetry_sink: list[tuple[str, dict[str, object]]]
) -> None:
    monkeypatch.setenv("WEB_BASE_URL", "https://web.example")
    start = client.post("/events/event-link/live/start", headers=ADMIN_HEADERS)
    assert start.status_code == 200

    response = client.get("/events/event-link/live/viewer_link", headers=ADMIN_HEADERS)
    assert response.status_code == 200
    body = response.json()
    url = body["url"]

    assert url.startswith("https://web.example/events/event-link/live-view?token=")
    token = url.split("token=")[-1]
    assert token

    assert any(
        name == "live.viewer_link.copied" and payload.get("eventId") == "event-link"
        for name, payload in telemetry_sink
    )
