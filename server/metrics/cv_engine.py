from __future__ import annotations

from prometheus_client import Histogram

from . import REGISTRY

CV_STAGE_LATENCY_MS = Histogram(
    "cv_stage_latency_ms",
    "Latency per CV pipeline stage (milliseconds)",
    ["stage"],
    registry=REGISTRY,
    buckets=(1, 2, 5, 10, 20, 50, 100, 200, 400, 800, 1600),
)


def observe_stage_latency(stage: str, duration_ms: float) -> None:
    """Record latency for a named CV stage."""

    if duration_ms < 0:
        return
    CV_STAGE_LATENCY_MS.labels(stage=stage).observe(duration_ms)


__all__ = ["observe_stage_latency", "CV_STAGE_LATENCY_MS"]
