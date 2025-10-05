from __future__ import annotations

from typing import Any, Mapping

from .base import CoachProvider


class MockCoachProvider(CoachProvider):
    """Deterministic mock provider for local development and tests."""

    name = "mock"

    _TEXT = (
        "Solid strike overall. Keep the tempo smooth and stay tall through impact. "
        "Focus on matching club and ball speed windows, then repeat with two alignment-rod drills."
    )

    def generate(self, metrics: Mapping[str, Any]) -> str:
        return self._TEXT
