import importlib

import pytest
from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


@pytest.fixture()
def repo(monkeypatch: pytest.MonkeyPatch):
    events_module = importlib.import_module("server.routes.events")
    repository = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repository)
    return repository


def test_event_session_returns_admin_role(repo):
    event = repo.create_event("Championship", None, code="ADMIN01")
    repo.add_member(event["id"], member_id="host-1", name="Host", role="admin")

    response = client.get(
        f"/events/{event['id']}/session", params={"memberId": "host-1"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "admin"
    assert payload["memberId"] == "host-1"
    assert payload["safe"] is False
    assert isinstance(payload.get("ts"), str)


def test_event_session_defaults_to_spectator(repo):
    event = repo.create_event("Open", None, code="SPEC001")
    repo.add_member(event["id"], member_id="actual-host", name="Host", role="admin")

    response = client.get(
        f"/events/{event['id']}/session", params={"memberId": "guest-5"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "spectator"
    assert payload["memberId"] == "guest-5"
    assert payload["safe"] is False


def test_event_session_safe_flag_from_host_state(repo, monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    event = repo.create_event("Finals", None, code="SAFE001")
    repo.add_member(event["id"], member_id="host-safe", name="Host", role="admin")

    class _StubState:
        def __init__(self, safe: bool):
            self.safe = safe

        def model_dump(self, **_: object):  # pragma: no cover - signature match
            return {"safe": self.safe}

    monkeypatch.setattr(
        events_module,
        "_build_host_state",
        lambda event_id: _StubState(True),  # type: ignore[arg-type]
    )

    response = client.get(
        f"/events/{event['id']}/session", params={"memberId": "host-safe"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["safe"] is True
    assert payload["role"] == "admin"


def test_event_session_missing_event_returns_404(repo):
    response = client.get("/events/00000000-0000-0000-0000-000000000000/session")
    assert response.status_code == 404
