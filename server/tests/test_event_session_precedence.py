from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.routes import events as events_routes
from server.routes import events_session as mod


client = TestClient(app)


class _StubMember:
    def __init__(self, role: str) -> None:
        self.role = role


class _StubRepository:
    def __init__(self, event_payload: dict[str, object]) -> None:
        self._event = event_payload

    def get_event(self, event_id: str):
        return self._event if event_id == self._event.get("id") else None

    def get_member(self, event_id: str, member_id: str | None):
        if event_id != self._event.get("id"):
            return None
        if member_id == self._event.get("host"):
            return _StubMember("admin")
        return None


def test_header_precedence_and_safe(monkeypatch) -> None:
    event_id = "evt1"
    repository = _StubRepository({"id": event_id, "host": "hdr"})
    monkeypatch.setattr(events_routes, "_REPOSITORY", repository, raising=False)
    monkeypatch.setattr(mod, "events_routes", events_routes, raising=False)
    monkeypatch.setattr(
        events_routes,
        "_build_host_state",
        lambda _: type("HostState", (), {"safe": True})(),
        raising=False,
    )

    response = client.get(
        f"/events/{event_id}/session",
        params={"memberId": "  hdr  "},
        headers={"x-event-member": "hdr"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "admin"
    assert payload["memberId"] == "hdr"
    assert payload["safe"] is True
