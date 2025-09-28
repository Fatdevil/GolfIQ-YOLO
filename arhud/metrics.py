from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AnchorConfidenceParams:
    variance: float
    tracking_quality: float
    elapsed_since_reset: float


def compute_anchor_confidence(variance: float, tracking_quality: float, elapsed_since_reset: float) -> float:
    if variance < 0:
        raise ValueError("variance must be non-negative")
    variance_term = max(0.0, 1.0 - variance * 50.0)
    quality_term = max(0.0, min(tracking_quality, 1.0))
    decay_term = max(0.0, 1.0 - elapsed_since_reset / 10.0)
    confidence = variance_term * 0.4 + quality_term * 0.5 + decay_term * 0.1
    return max(0.0, min(confidence, 1.0))