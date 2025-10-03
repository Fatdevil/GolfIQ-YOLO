from __future__ import annotations

from server.services.coach import FALLBACK_TEXT, generate_feedback
from server.services.coach.providers import CoachProviderTimeout, MockCoachProvider


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
