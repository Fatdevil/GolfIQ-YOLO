"""Telemetry helpers for CV engine instrumentation."""

from .cv import record_stage_latency, record_pose_metrics

__all__ = ["record_stage_latency", "record_pose_metrics"]
