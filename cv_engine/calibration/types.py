from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Sequence, Tuple

Point = Tuple[float, float]


@dataclass(frozen=True)
class TrackPoint:
    """Pixel-space track point with a frame index for timing/gap checks.

    frame_idx is sourced from the track sequence (e.g., stabilized per-frame list or
    sequential index in a raw point list) and is expected to be monotonic for that
    sequence.
    """

    frame_idx: int
    x_px: float
    y_px: float
    confidence: float | None = None
    is_interpolated: bool = False

    def as_point(self) -> Point:
        return (self.x_px, self.y_px)


@dataclass(frozen=True)
class CalibrationConfig:
    enabled: bool = False
    scale_px_per_meter: float | None = None
    meters_per_pixel: float | None = None
    reference_distance_m: float | None = None
    reference_points_px: tuple[Point, Point] | None = None
    camera_fps: float | None = None
    fps: float | None = None

    def resolve_meters_per_pixel(self) -> tuple[float | None, list[str]]:
        from .scale import resolve_scale

        result = resolve_scale(self)
        return result.meters_per_pixel, list(result.reason_codes)


@dataclass(frozen=True)
class LaunchWindowResult:
    start_index: int | None
    end_index: int | None
    start_frame: int | None
    end_frame: int | None
    confidence: float
    reason_codes: list[str] = field(default_factory=list)

    @property
    def length(self) -> int:
        if self.start_index is None or self.end_index is None:
            return 0
        return max(0, self.end_index - self.start_index + 1)


@dataclass(frozen=True)
class TrajectoryFitResult:
    calibrated: bool
    vx_mps: float | None = None
    vy_mps: float | None = None
    speed_mps: float | None = None
    speed_mph: float | None = None
    launch_angle_deg: float | None = None
    carry_m: float | None = None
    peak_height_m: float | None = None
    fit_r2: float | None = None
    fit_rmse: float | None = None
    reason_codes: list[str] = field(default_factory=list)
    pixel_speed: float | None = None
    pixel_angle_deg: float | None = None


def to_track_points(
    points_px: Sequence[Point] | Iterable[TrackPoint],
) -> list[TrackPoint]:
    if not points_px:
        return []
    if isinstance(points_px[0], TrackPoint):  # type: ignore[index]
        return list(points_px)  # type: ignore[return-value]
    return [
        TrackPoint(frame_idx=idx, x_px=pt[0], y_px=pt[1])
        for idx, pt in enumerate(points_px)  # type: ignore[arg-type]
    ]
