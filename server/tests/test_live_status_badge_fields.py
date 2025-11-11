from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream


client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-99"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "test-sign-key")
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    yield
    live_stream.reset()


def test_status_includes_badge_fields() -> None:
    response = client.post("/events/event-badge/live/start", headers=ADMIN_HEADERS)
    assert response.status_code == 200

    status_response = client.get("/events/event-badge/live/status")
    assert status_response.status_code == 200
    payload = status_response.json()

    assert payload["running"] is True
    assert payload["startedAt"] is not None
    assert isinstance(payload["viewers"], int)
    assert payload["viewers"] == 0

    minted = client.post("/events/event-badge/live/token", headers=ADMIN_HEADERS)
    assert minted.status_code == 200
    token = minted.json()["token"]

    with_token = client.get(
        f"/events/event-badge/live/status?token={token}",
        headers={"x-api-key": "optional"},
    )
    assert with_token.status_code == 200
    data_with_token = with_token.json()
    assert data_with_token["running"] is True
    assert data_with_token["viewers"] >= 1
