from __future__ import annotations

from prometheus_client import Counter, Histogram

from . import REGISTRY

PLAYSLIKE_TEMPALT_APPLIED_TOTAL = Counter(
    "playslike_tempalt_applied_total",
    "Count of plays-like evaluations where temperature/altitude adjustments were applied",
    registry=REGISTRY,
)

PLAYSLIKE_TEMPALT_DELTA_M = Histogram(
    "playslike_tempalt_delta_m",
    "Magnitude of combined temperature + altitude plays-like adjustments (metres)",
    buckets=(0.0, 0.5, 1.0, 2.5, 5.0, 7.5, 10.0, 15.0, 20.0),
    registry=REGISTRY,
)

PLAYSLIKE_TEMP_DELTA_M = Histogram(
    "playslike_temp_delta_m",
    "Magnitude of temperature-only plays-like adjustments (metres)",
    buckets=(0.0, 0.5, 1.0, 2.5, 5.0, 7.5, 10.0),
    registry=REGISTRY,
)

PLAYSLIKE_ALT_DELTA_M = Histogram(
    "playslike_alt_delta_m",
    "Magnitude of altitude-only plays-like adjustments (metres)",
    buckets=(0.0, 0.5, 1.0, 2.5, 5.0, 7.5, 10.0, 15.0),
    registry=REGISTRY,
)


def observe_tempalt_deltas(temp_delta: float, alt_delta: float, enabled: bool) -> None:
    """Record metrics for temperature/altitude adjustments."""

    magnitude_temp = abs(temp_delta)
    magnitude_alt = abs(alt_delta)
    total = abs(temp_delta + alt_delta)

    PLAYSLIKE_TEMP_DELTA_M.observe(magnitude_temp)
    PLAYSLIKE_ALT_DELTA_M.observe(magnitude_alt)
    if enabled:
        PLAYSLIKE_TEMPALT_APPLIED_TOTAL.inc()
        PLAYSLIKE_TEMPALT_DELTA_M.observe(total)


__all__ = [
    "PLAYSLIKE_TEMPALT_APPLIED_TOTAL",
    "PLAYSLIKE_TEMPALT_DELTA_M",
    "PLAYSLIKE_TEMP_DELTA_M",
    "PLAYSLIKE_ALT_DELTA_M",
    "observe_tempalt_deltas",
]
