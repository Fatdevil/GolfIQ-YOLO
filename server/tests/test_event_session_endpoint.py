import importlib

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from server.app import app
from server.routes import events_session as events_session_module


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
    assert payload["tournamentSafe"] is False
    assert isinstance(payload.get("ts"), int)


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
    assert payload["tournamentSafe"] is False


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
    assert payload["tournamentSafe"] is True


def test_event_session_tournament_flag_independent(repo, monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    event = repo.create_event("Masters", None, code="TS001")
    repo.add_member(event["id"], member_id="marshal", name="Marshal", role="admin")

    class _StubState:
        safe = False
        tournamentSafe = True

        def model_dump(self, **_: object) -> dict[str, object]:
            return {"safe": self.safe, "tournamentSafe": self.tournamentSafe}

    monkeypatch.setattr(
        events_module, "_build_host_state", lambda event_id: _StubState()
    )

    response = client.get(
        f"/events/{event['id']}/session", params={"memberId": "marshal"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["safe"] is False
    assert payload["tournamentSafe"] is True


def test_event_session_missing_event_returns_404(repo):
    response = client.get("/events/00000000-0000-0000-0000-000000000000/session")
    assert response.status_code == 404


def test_event_session_query_vs_header_precedence(repo):
    event = repo.create_event("Championship", None, code="AHEAD01")
    repo.add_member(event["id"], member_id="host-1", name="Host", role="admin")

    response = client.get(
        f"/events/{event['id']}/session",
        params={"memberId": "  host-1  "},
        headers={"x-event-member": "host-1"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "admin"
    assert payload["memberId"] == "host-1"


def test_event_session_default_safe_flag_when_host_state_missing(repo, monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    event = repo.create_event("Qualifier", None, code="SAFE000")
    repo.add_member(event["id"], member_id="host-2", name="Host", role="admin")

    monkeypatch.setattr(events_module, "_build_host_state", lambda event_id: None)

    response = client.get(
        f"/events/{event['id']}/session", params={"memberId": "host-2"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["safe"] is False
    assert payload["tournamentSafe"] is False


def test_event_session_uses_event_settings_for_safe_flag(repo, monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    event = repo.create_event("Invitational", None, code="SAFE999")
    repo.add_member(event["id"], member_id="host-3", name="Host", role="admin")

    repo._events[event["id"]]["safe"] = True  # type: ignore[attr-defined]
    repo._event_settings[event["id"]]["safe"] = True  # type: ignore[attr-defined]
    repo._event_settings[event["id"]]["tvFlags"]["safe"] = True  # type: ignore[attr-defined]
    monkeypatch.setattr(events_module, "_build_host_state", lambda event_id: None)

    response = client.get(
        f"/events/{event['id']}/session", params={"memberId": "host-3"}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["safe"] is True
    assert payload["tournamentSafe"] is True


def test_event_session_reraises_404_from_host_state(repo, monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    event = repo.create_event("Major", None, code="SAFE404")

    def _boom(_: str):
        raise HTTPException(status_code=404, detail="missing host state")

    monkeypatch.setattr(events_module, "_build_host_state", _boom)

    response = client.get(f"/events/{event['id']}/session")

    assert response.status_code == 404


def test_extract_from_mapping_returns_none_for_non_mapping():
    assert events_session_module._extract_from_mapping(None) is None
    assert events_session_module._extract_from_mapping("invalid") is None


def test_iter_host_candidates_handles_nested_mappings():
    event = {
        "host": {"memberId": "host-a", "member_id": "host-b"},
        "owner": "owner-1",
        "owner_id": "owner-2",
    }

    candidates = list(events_session_module._iter_host_candidates(event))

    assert "host-a" in candidates
    assert "host-b" in candidates
    assert candidates.count("owner-1") == 1
    assert candidates.count("owner-2") == 1


def test_resolve_role_uses_host_candidates(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(
        events_module._REPOSITORY, "get_member", lambda event_id, member_id: None
    )

    role = events_session_module._resolve_role(
        "evt-role", {"owner": "admin-123"}, "admin-123"
    )

    assert role == "admin"


def test_resolve_safe_flag_rethrows_404(monkeypatch):
    events_module = importlib.import_module("server.routes.events")

    def raise_404(event_id: str):
        raise HTTPException(status_code=404, detail="missing")

    monkeypatch.setattr(events_module, "_build_host_state", raise_404)

    with pytest.raises(HTTPException) as exc:
        events_session_module._resolve_safe_flag("evt-404", {})

    assert exc.value.status_code == 404


def test_resolve_safe_flag_handles_other_errors(monkeypatch):
    events_module = importlib.import_module("server.routes.events")

    def raise_error(event_id: str):
        raise RuntimeError("boom")

    monkeypatch.setattr(events_module, "_build_host_state", raise_error)

    event = {"safe": True}

    assert events_session_module._resolve_safe_flag("evt-safe", event) is True


def test_resolve_safe_flag_uses_model_dump_value(monkeypatch):
    events_module = importlib.import_module("server.routes.events")

    class DumpState:
        safe = "unknown"

        def model_dump(self, **kwargs: object) -> dict[str, object]:
            return {"safe": True}

    monkeypatch.setattr(
        events_module, "_build_host_state", lambda event_id: DumpState()
    )

    assert events_session_module._resolve_safe_flag("evt-dump", {}) is True


def test_resolve_safe_flag_uses_model_dump_alias(monkeypatch):
    events_module = importlib.import_module("server.routes.events")

    class AliasState:
        safe = None

        def model_dump(self, **kwargs: object) -> dict[str, object]:
            if kwargs.get("by_alias"):
                return {"safe": True}
            return {}

    monkeypatch.setattr(
        events_module, "_build_host_state", lambda event_id: AliasState()
    )

    assert events_session_module._resolve_safe_flag("evt-alias", {}) is True


def test_resolve_safe_flag_uses_nested_flags(monkeypatch):
    events_module = importlib.import_module("server.routes.events")

    class NestedState:
        safe = None

        def model_dump(self, **kwargs: object) -> dict[str, object]:
            if kwargs.get("by_alias"):
                return {}
            return {"tvFlags": {"tournamentSafe": True}}

    monkeypatch.setattr(
        events_module, "_build_host_state", lambda event_id: NestedState()
    )

    assert events_session_module._resolve_safe_flag("evt-nested", {}) is True


def test_resolve_safe_flag_reads_event_settings(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "_build_host_state", lambda event_id: None)

    event = {"settings": {"safe": True}}

    assert events_session_module._resolve_safe_flag("evt-settings", event) is True


def test_resolve_safe_flag_reads_nested_settings(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "_build_host_state", lambda event_id: None)

    event = {"settings": {"safe": "maybe", "tvFlags": {"tournament_safe": True}}}

    assert events_session_module._resolve_safe_flag("evt-flags", event) is True


def test_resolve_tournament_safe_flag_prefers_explicit(monkeypatch):
    events_module = importlib.import_module("server.routes.events")

    class State:
        safe = False
        tournamentSafe = True

        def model_dump(self, **_: object) -> dict[str, object]:
            return {"safe": self.safe, "tournamentSafe": self.tournamentSafe}

    monkeypatch.setattr(events_module, "_build_host_state", lambda event_id: State())

    event: dict[str, object] = {}

    assert events_session_module._resolve_tournament_safe_flag("evt-ts", event) is True


def test_resolve_tournament_safe_flag_falls_back_to_safe(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "_build_host_state", lambda event_id: None)

    event = {"settings": {"safe": True}}

    assert (
        events_session_module._resolve_tournament_safe_flag("evt-ts-safe", event)
        is True
    )
