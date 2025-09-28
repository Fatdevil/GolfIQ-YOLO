from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

from arhud.metrics import compute_anchor_confidence


@dataclass
class Anchor:
    position: Tuple[float, float, float]
    normal: Tuple[float, float, float]
    confidence: float


class GroundFitter:
    def __init__(self, smoothing: float = 0.2) -> None:
        self._anchors: List[Anchor] = []
        self._ema_normal: Optional[Tuple[float, float, float]] = None
        self._smoothing = smoothing

    def update(self, plane_points: List[Tuple[float, float, float]], tracking_quality: float, elapsed_since_reset: float) -> Anchor:
        if not plane_points:
            raise ValueError("plane_points must not be empty")
        centroid = tuple(sum(p[i] for p in plane_points) / len(plane_points) for i in range(3))
        normal = (0.0, 1.0, 0.0)
        if self._ema_normal is None:
            self._ema_normal = normal
        else:
            self._ema_normal = tuple(
                self._ema_normal[i] * (1 - self._smoothing) + normal[i] * self._smoothing for i in range(3)
            )
        variance = 0.01 if len(plane_points) > 3 else 0.05
        confidence = compute_anchor_confidence(variance, tracking_quality, elapsed_since_reset)
        anchor = Anchor(position=centroid, normal=self._ema_normal, confidence=confidence)
        self._anchors.append(anchor)
        return anchor

    @property
    def anchors(self) -> List[Anchor]:
        return list(self._anchors)