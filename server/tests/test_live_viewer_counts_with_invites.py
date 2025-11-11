from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream


client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-21"}


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    live_stream.reset()
    monkeypatch.setenv("LIVE_STREAM_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "test-sign-key")
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    yield
    live_stream.reset()


def test_multiple_exchanges_count_as_unique_viewers():
    event_id = "event-count"
    start = client.post(f"/events/{event_id}/live/start", headers=ADMIN_HEADERS)
    assert start.status_code == 200

    invite_response = client.get(
        f"/events/{event_id}/live/viewer_link", headers=ADMIN_HEADERS
    )
    assert invite_response.status_code == 200
    invite = invite_response.json()["url"].split("invite=")[-1]

    first_exchange = client.post(
        f"/events/{event_id}/live/exchange_invite",
        json={"invite": invite},
    )
    assert first_exchange.status_code == 200
    first_token = first_exchange.json()["token"]

    second_exchange = client.post(
        f"/events/{event_id}/live/exchange_invite",
        json={"invite": invite},
    )
    assert second_exchange.status_code == 200
    second_token = second_exchange.json()["token"]

    first_status = client.get(
        f"/events/{event_id}/live/status",
        params={"token": first_token},
    )
    assert first_status.status_code == 200

    second_status = client.get(
        f"/events/{event_id}/live/status",
        params={"token": second_token},
    )
    assert second_status.status_code == 200

    final_status = client.get(f"/events/{event_id}/live/status")
    assert final_status.status_code == 200
    assert final_status.json()["viewers"] >= 2
