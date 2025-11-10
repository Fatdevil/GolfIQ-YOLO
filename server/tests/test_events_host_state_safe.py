from fastapi.testclient import TestClient

from server.app import app
from server.routes import events as events_module


def test_get_host_state_reflects_safe(monkeypatch):
    app.dependency_overrides[events_module.require_admin] = lambda: "host1"
    safe_state = {
        "id": "evt123",
        "name": "Demo Event",
        "status": "running",
        "code": "JOIN123",
        "joinUrl": "https://example.test/join",
        "grossNet": "net",
        "tvFlags": {
            "showQrOverlay": False,
            "autoRotateTop": True,
            "rotateIntervalMs": None,
            "safe": True,
        },
        "participants": 0,
        "spectators": 0,
        "qrSvg": None,
        "safe": True,
    }
    monkeypatch.setattr(
        events_module,
        "_build_host_state",
        lambda event_id: safe_state,
        raising=True,
    )
    try:
        with TestClient(app) as client:
            response = client.get("/events/evt123/host")
        assert response.status_code == 200
        assert events_module._resolve_commentary_safe_flag("evt123") is True
    finally:
        app.dependency_overrides.pop(events_module.require_admin, None)


def test_host_action_denied_without_admin():
    with TestClient(app) as client:
        response = client.post("/events/evt123/pause")
    assert response.status_code in (401, 403)


def test_safe_flag_detection_handles_aliases():
    payload = {"tournamentSafe": True}
    assert events_module._safe_flag_from_host_state(payload) is True
    assert (
        events_module._safe_flag_from_host_state({"tvFlags": {"tournament_safe": True}})
        is True
    )


def test_resolve_commentary_safe_flag_falls_back_to_event(monkeypatch):
    class _DummyRepo:
        def get_event(self, event_id: str):
            return {
                "id": event_id,
                "settings": {
                    "tvFlags": {"safe": True},
                },
            }

    def _boom(event_id: str):
        raise Exception("boom")

    monkeypatch.setattr(events_module, "_build_host_state", _boom)
    monkeypatch.setattr(events_module, "_REPOSITORY", _DummyRepo())
    assert events_module._resolve_commentary_safe_flag("evt-fallback") is True
