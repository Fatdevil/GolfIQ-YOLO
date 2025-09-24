"""Telemetry helpers for CaddieCore."""

from __future__ import annotations

import os
from typing import Iterable

from prometheus_client import Counter, Histogram

from server.metrics import REGISTRY

_inference_histogram = Histogram(
    "caddie_recommend_latency_ms",
    "Latency of CaddieCore recommendations in milliseconds",
    labelnames=("scenario", "confidence"),
    registry=REGISTRY,
)

# Back-compat for older dashboards/tests
_inference_histogram_compat = Histogram(
    "caddie_recommend_inference_ms",
    "Latency of CaddieCore recommendations in milliseconds (compat)",
    labelnames=("scenario", "confidence"),
    registry=REGISTRY,
)

_request_counter = Counter(
    "caddie_recommend_requests_total",
    "Total CaddieCore recommendation invocations",
    labelnames=("scenario", "confidence"),
    registry=REGISTRY,
)

_factors_histogram = Histogram(
    "caddie_recommend_factors_count",
    "Number of explain-score factors included per recommendation",
    labelnames=("scenario", "confidence"),
    registry=REGISTRY,
)


def record_recommendation_metrics(
    *,
    duration_ms: float,
    scenario: str,
    confidence: str,
    factors_count: int,
) -> None:
    """Publish Prometheus metrics for a recommendation."""
    _inference_histogram.labels(scenario=scenario, confidence=confidence).observe(
        duration_ms
    )
    _inference_histogram_compat.labels(
        scenario=scenario, confidence=confidence
    ).observe(duration_ms)
    _request_counter.labels(scenario=scenario, confidence=confidence).inc()
    _factors_histogram.labels(scenario=scenario, confidence=confidence).observe(
        factors_count
    )


def build_structured_log_payload(
    *,
    telemetry_id: str,
    recommendation: dict,
    explain_score: Iterable[dict],
    duration_ms: float | None = None,
) -> dict:
    """Build a structured log record for downstream sinks."""
    payload = {
        "telemetry_id": telemetry_id,
        "recommendation": recommendation,
        "explain_score": list(explain_score),
        "build_version": os.getenv("BUILD_VERSION", "unknown"),
        "git_sha": os.getenv("GIT_SHA", "unknown"),
    }
    if duration_ms is not None:
        payload["duration_ms"] = duration_ms
    return payload
