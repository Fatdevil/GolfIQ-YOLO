from __future__ import annotations

from server.services.coach import FALLBACK_TEXT, generate_feedback
from server.services.coach.providers import (
    CoachProviderError,
    CoachProviderTimeout,
    MockCoachProvider,
    OpenAICoachProvider,
)
from server.services.coach.service import _provider_from_env


def test_mock_provider_returns_deterministic_text() -> None:
    provider = MockCoachProvider()
    first = provider.generate({"ballSpeedMps": 60})
    second = provider.generate({"ballSpeedMps": 45})
    assert first == second
    assert "tempo" in first.lower()


class TimeoutProvider(MockCoachProvider):
    name = "timeout"

    def generate(self, metrics):  # type: ignore[override]
        raise CoachProviderTimeout("timeout")


def test_timeout_falls_back_to_placeholder() -> None:
    result = generate_feedback({}, provider=TimeoutProvider())
    assert result["text"] == FALLBACK_TEXT
    assert result["provider"] == "fallback"
    assert result["latency_ms"] >= 0


class EchoProvider(MockCoachProvider):
    name = "echo"

    def generate(self, metrics):  # type: ignore[override]
        assert metrics == {"value": 1}
        return "All good"


def test_generate_feedback_returns_provider_result() -> None:
    result = generate_feedback({"value": 1}, provider=EchoProvider())
    assert result["text"] == "All good"
    assert result["provider"] == "echo"
    assert result["latency_ms"] >= 0


class ErrorProvider(MockCoachProvider):
    name = "error"

    def generate(self, metrics):  # type: ignore[override]
        raise CoachProviderError("boom")


def test_generate_feedback_handles_provider_error() -> None:
    result = generate_feedback({"value": 2}, provider=ErrorProvider())
    assert result["text"] == FALLBACK_TEXT
    assert result["provider"] == "fallback"
    assert result["latency_ms"] >= 0


def test_provider_from_env_selects_mock(monkeypatch) -> None:
    monkeypatch.setenv("COACH_PROVIDER", "mock")
    provider = _provider_from_env()
    assert isinstance(provider, MockCoachProvider)


def test_provider_from_env_defaults_to_openai(monkeypatch) -> None:
    monkeypatch.delenv("COACH_PROVIDER", raising=False)
    provider = _provider_from_env()
    assert isinstance(provider, OpenAICoachProvider)
