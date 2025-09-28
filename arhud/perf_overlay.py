from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class PerfSample:
    fps: float
    latency_ms: float
    tracking_quality: float
    thermal_level: str


@dataclass
class PerfOverlay:
    enabled: bool = False
    samples: List[PerfSample] = field(default_factory=list)

    def toggle(self) -> None:
        self.enabled = not self.enabled

    def record(self, sample: PerfSample) -> None:
        if self.enabled:
            self.samples.append(sample)