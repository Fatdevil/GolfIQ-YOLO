from __future__ import annotations

import importlib
from fastapi.testclient import TestClient

from server.app import app

client = TestClient(app)


class _RepoStub:
    def __init__(self):
        self.event_id = "e"
        self.status = "pending"
        self.code = "ABCDEFG"
        self.settings = {
            "grossNet": "net",
            "tvFlags": {
                "showQrOverlay": False,
                "autoRotateTop": True,
                "rotateIntervalMs": None,
            },
        }
        self._counts = {"participants": 2, "spectators": 5}

    def set_status(self, event_id: str, status: str):
        if event_id != self.event_id:
            return None
        self.status = status
        return {"status": status}

    def update_settings(self, event_id: str, *, settings: dict):
        if event_id != self.event_id:
            return None
        self.settings.update(settings)
        return {"event_id": event_id, "settings": self.settings}

    def get_event(self, event_id: str):
        if event_id != self.event_id:
            return None
        return {
            "id": event_id,
            "name": "Stub Event",
            "status": self.status,
            "code": self.code,
            "settings": self.settings,
            "participants": self._counts["participants"],
            "spectators": self._counts["spectators"],
        }

    def counts(self, event_id: str):
        return self._counts

    def regenerate_code(self, event_id: str, candidate: str):
        if event_id != self.event_id:
            return None
        self.code = candidate
        return {"code": candidate}

    def resolve_event_by_code(self, code: str):
        if code == self.code:
            return {"id": self.event_id}
        return None

    def get_settings(self, event_id: str):
        if event_id != self.event_id:
            return {}
        return self.settings


def _install_repo(monkeypatch) -> _RepoStub:
    repo = _RepoStub()
    mod = importlib.import_module("server.routes.events")
    monkeypatch.setattr(mod, "_REPOSITORY", repo)
    return repo


def _record_telemetry(monkeypatch):
    mod = importlib.import_module("server.routes.events")
    calls = {"count": 0}

    def _increment(*args, **kwargs):
        calls["count"] += 1

    monkeypatch.setattr(mod, "record_host_action", _increment)
    return calls


def test_start_pause_close_admin_ok_emits(monkeypatch):
    _install_repo(monkeypatch)
    calls = _record_telemetry(monkeypatch)
    headers = {"x-event-role": "admin", "x-event-member": "m1"}

    r1 = client.post("/events/e/start", headers=headers)
    r2 = client.post("/events/e/pause", headers=headers)
    r3 = client.post("/events/e/close", headers=headers)

    assert r1.status_code in (200, 201, 204)
    assert r2.status_code in (200, 201, 204)
    assert r3.status_code in (200, 201, 204)
    assert calls["count"] >= 3


def test_settings_partial_defaults_ok(monkeypatch):
    repo = _install_repo(monkeypatch)
    headers = {"x-event-role": "admin"}

    response = client.patch(
        "/events/e/settings", json={"grossNet": "gross"}, headers=headers
    )
    assert response.status_code in (200, 204)
    assert repo.settings["grossNet"] == "gross"


def test_settings_validation_error_422(monkeypatch):
    _install_repo(monkeypatch)
    headers = {"x-event-role": "admin"}

    response = client.patch(
        "/events/e/settings", json={"grossNet": 123}, headers=headers
    )
    assert response.status_code == 422


def test_regenerate_always_returns_svg(monkeypatch):
    repo = _install_repo(monkeypatch)
    headers = {"x-event-role": "admin"}

    qr_mod = importlib.import_module("server.utils.qr_svg")
    monkeypatch.setattr(qr_mod, "qr_svg", lambda *args, **kwargs: None)
    monkeypatch.setattr(qr_mod, "qr_svg_placeholder", lambda *args, **kwargs: "<svg/>")

    response = client.post("/events/e/code/regenerate", headers=headers)
    assert response.status_code in (200, 201)
    payload = response.json()
    assert isinstance(payload.get("qrSvg"), str)
    assert payload["qrSvg"].startswith("<svg")
    assert repo.code != "ABCDEFG"
