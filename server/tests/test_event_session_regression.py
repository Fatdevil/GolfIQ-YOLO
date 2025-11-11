from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from server.app import app
from server.routes import events as events_routes


class _RepoStub:
    def get_event(self, event_id: str):  # pragma: no cover - simple stub
        return {"id": event_id, "hostMemberId": "m1"}

    def get_member(self, event_id: str, member_id: str):
        return SimpleNamespace(role="admin")


def test_session_admin_and_safe(monkeypatch):
    monkeypatch.setattr(events_routes, "_REPOSITORY", _RepoStub())
    monkeypatch.setattr(
        events_routes,
        "_build_host_state",
        lambda event_id: SimpleNamespace(safe=True),
        raising=False,
    )

    with TestClient(app) as client:
        response = client.get("/events/evt1/session", params={"memberId": "m1"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "admin"
    assert payload["memberId"] == "m1"
    assert payload["safe"] is True
    assert isinstance(payload["ts"], str)
