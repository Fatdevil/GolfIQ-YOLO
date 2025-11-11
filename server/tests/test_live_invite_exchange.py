from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import live_stream, viewer_token
from server.telemetry import events as telemetry_events


client = TestClient(app, raise_server_exceptions=False)
ADMIN_HEADERS = {"x-event-role": "admin", "x-event-member": "host-11"}


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


def _start_live(event_id: str = "event-invite") -> None:
    response = client.post(f"/events/{event_id}/live/start", headers=ADMIN_HEADERS)
    assert response.status_code == 200


def _get_invite(event_id: str = "event-invite") -> str:
    _start_live(event_id)
    response = client.get(f"/events/{event_id}/live/viewer_link", headers=ADMIN_HEADERS)
    assert response.status_code == 200
    payload = response.json()
    url = payload["url"]
    return url.split("invite=")[-1]


def test_exchange_invite_returns_unique_tokens(telemetry_sink):
    invite = _get_invite()

    first = client.post(
        "/events/event-invite/live/exchange_invite",
        json={"invite": invite},
    )
    assert first.status_code == 200
    first_payload = first.json()
    first_token = first_payload["token"]

    second = client.post(
        "/events/event-invite/live/exchange_invite",
        json={"invite": invite},
    )
    assert second.status_code == 200
    second_payload = second.json()
    second_token = second_payload["token"]

    assert first_token != second_token

    first_meta = viewer_token.decode_token(first_token)
    second_meta = viewer_token.decode_token(second_token)
    assert first_meta is not None and second_meta is not None
    assert first_meta["viewerId"] != second_meta["viewerId"]

    assert any(name == "live.invite.exchange" for name, _ in telemetry_sink)


def test_exchange_invite_requires_matching_event():
    invite = _get_invite("event-one")

    response = client.post(
        "/events/event-two/live/exchange_invite",
        json={"invite": invite},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "invite does not match event"
