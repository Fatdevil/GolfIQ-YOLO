from __future__ import annotations

import os
import time
from typing import Any, Mapping

import httpx

from .providers import (
    CoachProvider,
    CoachProviderError,
    CoachProviderTimeout,
    MockCoachProvider,
    OpenAICoachProvider,
)

FALLBACK_TEXT = (
    "Coach feedback is taking longer than expected. Please try again in a moment."
)


def _provider_from_env() -> CoachProvider:
    name = os.getenv("COACH_PROVIDER", "openai").strip().lower()
    if name == "mock":
        return MockCoachProvider()
    return OpenAICoachProvider()


def generate_feedback(
    metrics: Mapping[str, Any] | None,
    *,
    provider: CoachProvider | None = None,
) -> dict[str, Any]:
    metrics_dict = dict(metrics or {})
    active_provider = provider or _provider_from_env()
    start = time.perf_counter()
    try:
        text = active_provider.generate(metrics_dict)
        provider_name = getattr(
            active_provider, "name", active_provider.__class__.__name__
        )
        latency = int((time.perf_counter() - start) * 1000)
        return {"text": text, "provider": provider_name, "latency_ms": latency}
    except (CoachProviderTimeout, httpx.TimeoutException, TimeoutError):
        latency = int((time.perf_counter() - start) * 1000)
        return {"text": FALLBACK_TEXT, "provider": "fallback", "latency_ms": latency}
    except CoachProviderError:
        latency = int((time.perf_counter() - start) * 1000)
        return {"text": FALLBACK_TEXT, "provider": "fallback", "latency_ms": latency}
