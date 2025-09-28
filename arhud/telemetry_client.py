from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

METRIC_NAMES = {
    "session_count",
    "session_duration_s",
    "fps_avg",
    "fps_p10",
    "hud_latency_ms_p50",
    "hud_latency_ms_p90",
    "tracking_quality_p50",
    "anchor_resets_count",
    "thermal_warnings_count",
    "fallback_events_count",
}


@dataclass
class MetricRecord:
    name: str
    value: float
    device_class: str
    sampled: bool


class TelemetryClient:
    def __init__(self) -> None:
        self.records: List[MetricRecord] = []

    def emit(self, name: str, value: float, device_class: str, sampled: bool) -> None:
        if name not in METRIC_NAMES:
            raise ValueError(f"Unknown metric: {name}")
        self.records.append(
            MetricRecord(
                name=name, value=value, device_class=device_class, sampled=sampled
            )
        )


class StructuredLogger:
    def __init__(self) -> None:
        self.entries: List[Dict[str, object]] = []

    def log(
        self,
        level: str,
        message: str,
        build_id: str,
        device_class: str,
        data: Dict[str, object] | None = None,
    ) -> None:
        payload = {
            "level": level,
            "message": message,
            "build_id": build_id,
            "device_class": device_class,
            "data": self._redact(data or {}),
        }
        self.entries.append(payload)

    @staticmethod
    def _redact(data: Dict[str, object]) -> Dict[str, object]:
        redacted = dict(data)
        if "frames" in redacted:
            redacted["frames"] = "[redacted]"
        if "location" in redacted:
            redacted["location"] = "[redacted]"
        return redacted


class TraceSampler:
    def __init__(self, rate: float = 0.1) -> None:
        if not 0 <= rate <= 1:
            raise ValueError("rate must be between 0 and 1")
        self.rate = rate
        self.count = 0
        self.total = 0

    def should_sample(self) -> bool:
        self.total += 1
        if self.count / max(self.total, 1) >= self.rate:
            return False
        self.count += 1
        return True
