from __future__ import annotations

import importlib
from typing import List, Tuple

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.telemetry import events as telemetry_events


client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_repo_and_env(monkeypatch):
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)
    yield repo


@pytest.fixture
def telemetry_sink():
    captured: List[Tuple[str, dict]] = []

    def _emit(name: str, payload):
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    yield captured
    telemetry_events.set_events_telemetry_emitter(None)


def test_join_unknown_code_returns_404(monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    valid_code = events_module.generate_code()
    monkeypatch.setattr(events_module, "validate_code", lambda _: True)

    response = client.post(f"/join/{valid_code}")

    assert response.status_code == 404
    body = response.json()
    assert body["detail"] == "event not found"


def test_create_event_requires_non_blank_name():
    response = client.post("/events", json={"name": ""})
    assert response.status_code == 422


def test_create_event_emits_telemetry_on_failure(telemetry_sink, monkeypatch):
    events_module = importlib.import_module("server.routes.events")
    monkeypatch.setattr(events_module, "qr_svg", lambda _: None)

    response = client.post("/events", json={"name": "Friday"})

    assert response.status_code == 201
    assert any(event == "events.create" for event, _ in telemetry_sink)
