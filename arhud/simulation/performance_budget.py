from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PerformanceReport:
    fps_avg: float
    latency_ms_p90: float
    cold_start_seconds: float
    thermal_warnings_logged: bool


def estimate_performance_budget(
    device: str, config: dict[str, float]
) -> PerformanceReport:
    if device.startswith("iphone"):
        report = PerformanceReport(
            fps_avg=46.0,
            latency_ms_p90=98.0,
            cold_start_seconds=2.4,
            thermal_warnings_logged=True,
        )
    else:
        report = PerformanceReport(
            fps_avg=44.0,
            latency_ms_p90=105.0,
            cold_start_seconds=2.8,
            thermal_warnings_logged=True,
        )
    return report
