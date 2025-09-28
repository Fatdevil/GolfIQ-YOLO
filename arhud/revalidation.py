from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RevalidationContext:
    delta_position: float
    delta_rotation: float
    tracking_quality: float
    elapsed_since_last: float
    validations_this_second: int


THRESHOLD_POSITION = 0.20
THRESHOLD_ROTATION_DEG = 0.8
QUALITY_THRESHOLD = 0.6
HEARTBEAT_SECONDS = 0.5
MAX_VALIDATIONS_PER_SECOND = 10
DEBOUNCE_SECONDS = 0.05


def should_revalidate(
    delta_position: float,
    delta_rotation: float,
    tracking_quality: float,
    elapsed_since_last: float,
    validations_this_second: int,
) -> bool:
    if validations_this_second >= MAX_VALIDATIONS_PER_SECOND:
        return False
    if elapsed_since_last < DEBOUNCE_SECONDS:
        return False
    if delta_position >= THRESHOLD_POSITION:
        return True
    if delta_rotation >= THRESHOLD_ROTATION_DEG:
        return True
    if tracking_quality < QUALITY_THRESHOLD:
        return True
    if elapsed_since_last >= HEARTBEAT_SECONDS:
        return True
    return False