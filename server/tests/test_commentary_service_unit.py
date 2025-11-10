from __future__ import annotations

import json
from typing import Any, Dict

import pytest

from server.services import commentary


@pytest.fixture(autouse=True)
def reset_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_ENABLED", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


def test_build_prompt_includes_locale_and_leaderboard() -> None:
    clip = {
        "id": "clip-1",
        "event_id": "event-1",
        "player_name": "Linn",
        "hole": 7,
        "par": 4,
        "strokes": 3,
        "to_par": -1,
        "description": "Pitch from 40 yards drops for birdie",
    }
    event = {"id": "event-1", "name": "Nordic Open", "locale": "sv"}
    board = [
        {"name": "Linn", "gross": 35, "net": -2, "thru": 9, "to_par": -2},
        {"name": "Sara", "gross": 37, "net": 0, "thru": 9, "to_par": 0},
    ]

    prompt = commentary.build_prompt(clip, event, board)

    assert "Language: sv" in prompt
    assert "Player: Linn" in prompt
    assert "Hole: 7" in prompt
    assert "Par: 4" in prompt
    assert "Relative score: -1" in prompt
    assert "gross 35" in prompt
    assert "net -2" in prompt


class _StubResponse:
    def __init__(self, payload: Dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:  # pragma: no cover - no-op for stub
        return None

    def json(self) -> Dict[str, Any]:
        return self._payload


def test_call_llm_returns_trimmed_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("LLM_MODEL", "gpt-test")

    def fake_post(*_args: Any, **_kwargs: Any) -> _StubResponse:
        payload = {
            "choices": [
                {
                    "message": {
                        "content": json.dumps(
                            {
                                "title": "  Amazing recovery ",
                                "summary": "  Detailed highlight summary that remains factual.  ",
                            }
                        )
                    }
                }
            ]
        }
        return _StubResponse(payload)

    monkeypatch.setattr(commentary.httpx, "post", fake_post)

    result = commentary.call_llm("prompt")
    assert result == {
        "title": "Amazing recovery",
        "summary": "Detailed highlight summary that remains factual.",
    }


def test_call_llm_invalid_payload_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    def fake_post(*_args: Any, **_kwargs: Any) -> _StubResponse:
        payload = {"choices": [{"message": {"content": json.dumps({"title": 12})}}]}
        return _StubResponse(payload)

    monkeypatch.setattr(commentary.httpx, "post", fake_post)

    with pytest.raises(ValueError):
        commentary.call_llm("prompt")


def test_build_prompt_handles_iterable_board_and_event_id() -> None:
    clip = {"id": "clip-2", "playerName": "Alex", "hole_number": 3, "parValue": 3}
    event = {"id": "event-2", "name": "City Open"}

    def board_rows():
        yield {"player": "Alex", "gross": 12, "hole": 4}

    prompt = commentary.build_prompt(clip, event, board_rows())
    assert "Event ID: event-2" in prompt
    assert "hole 4" in prompt


def test_synthesize_tts_behaviour(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TTS_ENABLED", raising=False)
    assert commentary.synthesize_tts("hello") is None

    monkeypatch.setenv("TTS_ENABLED", "true")
    monkeypatch.setenv("TTS_PROVIDER", "other")
    with pytest.raises(RuntimeError):
        commentary.synthesize_tts("hello")


def test_require_event_id_and_load_event(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValueError):
        commentary._require_event_id({})

    from server.routes import events as events_routes

    original_repo = events_routes._REPOSITORY

    class DummyRepo:
        def get_event(self, _event_id: str) -> dict | None:
            return None

        def get_board(self, _event_id: str) -> list:
            return []

    events_routes._REPOSITORY = DummyRepo()
    try:
        with pytest.raises(LookupError):
            commentary._load_event("missing")
    finally:
        events_routes._REPOSITORY = original_repo
