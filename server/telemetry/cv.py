from __future__ import annotations

from typing import Mapping, Optional

from server.metrics.cv_engine import observe_stage_latency


def record_stage_latency(stage: str, duration_ms: float) -> None:
    """Forward CV stage timing to Prometheus."""

    observe_stage_latency(stage, duration_ms)


def record_pose_metrics(metrics: Mapping[str, Optional[float]]) -> None:
    """Placeholder hook for internal pose diagnostics."""

    # Metrics are currently internal-only; forwarded to observability sinks later.
    _ = metrics
