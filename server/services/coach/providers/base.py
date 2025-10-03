from __future__ import annotations

import abc
from typing import Any, Mapping


class CoachProviderError(Exception):
    """Base error raised by coach providers."""


class CoachProviderTimeout(CoachProviderError):
    """Raised when a provider exceeds its timeout budget."""


class CoachProvider(abc.ABC):
    """Interface for coach feedback providers."""

    name: str = "provider"

    @abc.abstractmethod
    def generate(self, metrics: Mapping[str, Any]) -> str:
        """Generate feedback for the supplied swing metrics."""
