"""OpenTelemetry span helper utilities."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

_OTEL_ENV_FLAG = os.getenv("OTEL_ENABLED", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}
_tracer = None

if _OTEL_ENV_FLAG:
    try:
        from opentelemetry import trace  # type: ignore
    except ImportError:  # pragma: no cover - defensive guard
        _OTEL_ENV_FLAG = False
        trace = None  # type: ignore
    else:
        _tracer = trace.get_tracer(__name__)


def is_enabled() -> bool:
    """Return whether OpenTelemetry spans are enabled via the environment."""

    return bool(_OTEL_ENV_FLAG and _tracer is not None)


@contextmanager
def span(name: str, attributes: Optional[Dict[str, Any]] = None) -> Iterator[Any]:
    """Context manager that records an OpenTelemetry span when enabled."""

    if not is_enabled():
        yield None
        return

    assert _tracer is not None  # for type-checkers
    with _tracer.start_as_current_span(name) as otel_span:
        if attributes:
            for key, value in attributes.items():
                otel_span.set_attribute(key, value)
        yield otel_span
