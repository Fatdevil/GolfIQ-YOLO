from __future__ import annotations

import importlib
import pytest
from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def _setup_event(monkeypatch: pytest.MonkeyPatch):
    mod = importlib.import_module("server.routes.events")
    repo = mod._MemoryEventsRepository()
    event = repo.create_event("Club Night", None, code="ABCDEF1")
    monkeypatch.setattr(mod, "_REPOSITORY", repo)
    return mod, event["id"]


def _patch_qr(monkeypatch: pytest.MonkeyPatch, always_svg: bool = True):
    q = importlib.import_module("server.utils.qr_svg")
    if always_svg:
        monkeypatch.setattr(q, "qr_svg", lambda *a, **k: "<svg/>")
    else:
        monkeypatch.setattr(q, "qr_svg", lambda *a, **k: None)
        monkeypatch.setattr(q, "qr_svg_placeholder", lambda *a, **k: "<svg/>")


def test_admin_patch_settings_persists(monkeypatch: pytest.MonkeyPatch):
    _, event_id = _setup_event(monkeypatch)
    body = {"grossNet": "net", "tvFlags": {"showQR": True, "rotateSec": 6}}
    headers = {"x-event-role": "admin"}
    response = client.patch(f"/events/{event_id}/settings", json=body, headers=headers)
    assert response.status_code in (200, 204)


def test_admin_start_forbidden_without_role(monkeypatch: pytest.MonkeyPatch):
    _, event_id = _setup_event(monkeypatch)
    response = client.post(f"/events/{event_id}/start")
    assert response.status_code == 403


def test_admin_regenerate_returns_svg_always(monkeypatch: pytest.MonkeyPatch):
    mod, event_id = _setup_event(monkeypatch)
    _patch_qr(monkeypatch, always_svg=False)
    monkeypatch.setattr(mod, "generate_code", lambda: "ZZZZZZ1")
    headers = {"x-event-role": "admin"}
    response = client.post(f"/events/{event_id}/code/regenerate", headers=headers)
    assert response.status_code in (200, 201)
    payload = response.json()
    assert isinstance(payload.get("qrSvg"), str)
    assert payload["qrSvg"].startswith("<svg")


def test_admin_regenerate_forbidden_without_role(monkeypatch: pytest.MonkeyPatch):
    _, event_id = _setup_event(monkeypatch)
    response = client.post(f"/events/{event_id}/code/regenerate")
    assert response.status_code == 403
