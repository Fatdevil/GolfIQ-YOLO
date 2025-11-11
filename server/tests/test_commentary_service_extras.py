from __future__ import annotations

import pytest

from server.services import commentary


def test_build_prompt_includes_optional_fields() -> None:
    clip = {
        "player_name": "Jordan",
        "hole": 5,
        "par": 4,
        "strokes": 3,
        "to_par": -1,
        "description": "Lasered approach to a tucked pin.",
    }
    event = {"name": "Autumn Classic", "id": "evt-7", "locale": "en"}
    board = [
        {"name": "Jordan", "gross": 72, "net": 70, "to_par": -2, "thru": 12},
        {"player": "Riley", "gross": 74, "hole": 15},
    ]

    prompt = commentary.build_prompt(clip, event, board)

    assert "gross 72" in prompt
    assert "net 70" in prompt
    assert "to par -2" in prompt
    assert "thru 12" in prompt
    assert "hole 15" in prompt
    assert "Event ID: evt-7" in prompt
    assert "Par: 4" in prompt and "Strokes: 3" in prompt
    assert "Relative score: -1" in prompt
    assert "Clip notes: Lasered approach" in prompt


def test_call_llm_guard_conditions(monkeypatch) -> None:
    monkeypatch.delenv("LLM_ENABLED", raising=False)
    with pytest.raises(RuntimeError):
        commentary.call_llm("prompt")

    monkeypatch.setenv("LLM_ENABLED", "true")
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    with pytest.raises(RuntimeError):
        commentary.call_llm("prompt")

    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        commentary.call_llm("prompt")


def test_resolve_clip_sg_delta_handles_invalid() -> None:
    clip = {"sg_delta": "0.45"}
    assert commentary._resolve_clip_sg_delta(clip) == pytest.approx(0.45)

    clip_invalid = {"sgDelta": "not-a-number"}
    assert commentary._resolve_clip_sg_delta(clip_invalid) is None
