from __future__ import annotations

import importlib
from typing import Dict, List, Tuple
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.services import clips_repo, commentary
from server.telemetry import events as telemetry_events

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("API_KEY", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("LLM_ENABLED", raising=False)
    monkeypatch.delenv("TTS_ENABLED", raising=False)

    events_module = importlib.import_module("server.routes.events")
    repo = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repo)

    monkeypatch.setattr(clips_repo, "_CLIP_STORE", {})

    telemetry_events.set_events_telemetry_emitter(None)
    yield repo
    telemetry_events.set_events_telemetry_emitter(None)


@pytest.fixture
def telemetry_sink() -> List[Tuple[str, Dict[str, object]]]:
    captured: List[Tuple[str, Dict[str, object]]] = []

    def _emit(name: str, payload: Dict[str, object]) -> None:
        captured.append((name, dict(payload)))

    telemetry_events.set_events_telemetry_emitter(_emit)
    try:
        yield captured
    finally:
        telemetry_events.set_events_telemetry_emitter(None)


def _prepare_clip(repo, clip_id: str):
    event = repo.create_event("AI Showcase", None, code="AI0001")
    event_id = event["id"]
    repo._boards[event_id] = [
        {"name": "Linn", "gross": 35, "net": -2, "thru": 9, "to_par": -2},
        {"name": "Sara", "gross": 37, "net": 0, "thru": 9, "to_par": 0},
    ]
    clips_repo.register_clip(
        {
            "id": clip_id,
            "event_id": event_id,
            "player_name": "Linn",
            "hole": 9,
            "par": 4,
            "strokes": 3,
            "to_par": -1,
            "description": "Linn drains a long putt",
        }
    )
    return event_id


def test_generate_commentary_with_tts(
    monkeypatch: pytest.MonkeyPatch, telemetry_sink, _reset_state
):
    clip_id = str(uuid4())
    repo = _reset_state
    _prepare_clip(repo, clip_id)

    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("TTS_ENABLED", "true")

    def fake_call_llm(prompt: str) -> Dict[str, str]:
        assert "Language:" in prompt
        long_summary = "Birdie! " + "a" * 240
        return {"title": "Linn converts on nine", "summary": long_summary}

    monkeypatch.setattr(commentary, "call_llm", fake_call_llm)

    def fake_tts(text: str) -> str:
        assert len(text) <= 200
        return "https://cdn.example.com/clip.mp3"

    monkeypatch.setattr(commentary, "synthesize_tts", fake_tts)

    response = client.post(
        f"/events/clips/{clip_id}/commentary",
        headers={"x-event-role": "admin"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "Linn converts on nine"
    assert body["summary"].startswith("Birdie!")
    assert len(body["summary"]) <= 200
    assert body["ttsUrl"] == "https://cdn.example.com/clip.mp3"

    stored = clips_repo.get_clip(clip_id)
    assert stored["ai_title"] == "Linn converts on nine"
    assert stored["ai_summary"].startswith("Birdie!")
    assert stored["ai_tts_url"] == "https://cdn.example.com/clip.mp3"

    assert any(
        name == "clip.commentary.ok" and payload.get("hasTts")
        for name, payload in telemetry_sink
    )


def test_generate_commentary_without_tts(
    monkeypatch: pytest.MonkeyPatch, telemetry_sink, _reset_state
):
    clip_id = str(uuid4())
    repo = _reset_state
    _prepare_clip(repo, clip_id)

    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("TTS_ENABLED", "false")

    monkeypatch.setattr(
        commentary,
        "call_llm",
        lambda prompt: {"title": "Ace alert", "summary": "Factual description"},
    )
    monkeypatch.setattr(
        commentary,
        "synthesize_tts",
        lambda text: pytest.fail("should not call TTS"),
    )

    response = client.post(
        f"/events/clips/{clip_id}/commentary",
        headers={"x-event-role": "admin"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["ttsUrl"] is None

    stored = clips_repo.get_clip(clip_id)
    assert stored["ai_tts_url"] is None

    assert any(
        name == "clip.commentary.ok" and not payload.get("hasTts")
        for name, payload in telemetry_sink
    )


def test_generate_commentary_failure_returns_500(
    monkeypatch: pytest.MonkeyPatch, telemetry_sink, _reset_state
):
    clip_id = str(uuid4())
    repo = _reset_state
    _prepare_clip(repo, clip_id)

    monkeypatch.setenv("LLM_ENABLED", "true")

    def boom(_prompt: str) -> Dict[str, str]:
        raise RuntimeError("llm exploded")

    monkeypatch.setattr(commentary, "call_llm", boom)

    response = client.post(
        f"/events/clips/{clip_id}/commentary",
        headers={"x-event-role": "admin"},
    )
    assert response.status_code == 500
    assert any(name == "clip.commentary.failed" for name, _payload in telemetry_sink)


def test_generate_commentary_requires_admin(_reset_state):
    clip_id = str(uuid4())
    repo = _reset_state
    _prepare_clip(repo, clip_id)

    response = client.post(
        f"/events/clips/{clip_id}/commentary",
        headers={"x-event-role": "spectator"},
    )
    assert response.status_code == 403
