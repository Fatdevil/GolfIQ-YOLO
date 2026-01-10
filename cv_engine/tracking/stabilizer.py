from __future__ import annotations

import os
import statistics
from dataclasses import dataclass
from typing import Iterable, Sequence, Tuple

from cv_engine.types import Box


Point = Tuple[float, float]


@dataclass(frozen=True)
class BallDetection:
    x: float
    y: float
    confidence: float

    @classmethod
    def from_box(cls, box: Box) -> "BallDetection":
        cx, cy = box.center()
        return cls(cx, cy, float(box.score))


@dataclass(frozen=True)
class BallTrackPoint:
    x: float
    y: float
    confidence: float
    is_interpolated: bool = False

    def as_point(self) -> Point:
        return (self.x, self.y)


@dataclass
class StabilizedTrack:
    points: list[BallTrackPoint | None]
    n_frames: int
    n_detections: int
    n_missing: int
    max_gap: int
    gap_ratio: float
    jitter_px: float

    def as_points(self) -> list[Point]:
        return [point.as_point() for point in self.points if point is not None]

    def metrics(self, *, id_switches: int = 0, stabilized: bool = True) -> dict:
        return {
            "n_frames": self.n_frames,
            "n_detections": self.n_detections,
            "n_missing": self.n_missing,
            "max_gap": self.max_gap,
            "gap_ratio": round(self.gap_ratio, 4),
            "jitter_px": round(self.jitter_px, 3),
            "id_switches": int(id_switches),
            "stabilized": stabilized,
        }


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def compute_jitter_px(points: Sequence[Point]) -> float:
    if len(points) < 3:
        return 0.0
    steps = [
        (
            (points[i][0] - points[i - 1][0]) ** 2
            + (points[i][1] - points[i - 1][1]) ** 2
        )
        ** 0.5
        for i in range(1, len(points))
    ]
    if len(steps) < 2:
        return 0.0
    accel = [abs(steps[i] - steps[i - 1]) for i in range(1, len(steps))]
    if not accel:
        return 0.0
    return float(statistics.median(accel))


class BallTrackingStabilizer:
    """Single-track stabilizer with gating, interpolation, and EMA smoothing."""

    def __init__(
        self,
        *,
        max_gap_frames: int = 4,
        gating_distance: float = 90.0,
        outlier_distance: float = 140.0,
        smoothing_alpha: float = 0.45,
    ) -> None:
        self.max_gap_frames = max(0, int(max_gap_frames))
        self.gating_distance = float(gating_distance)
        self.outlier_distance = float(outlier_distance)
        self.smoothing_alpha = float(smoothing_alpha)

    def stabilize(
        self, detections_per_frame: Sequence[Sequence[BallDetection]]
    ) -> StabilizedTrack:
        points: list[BallTrackPoint | None] = [None] * len(detections_per_frame)
        last_smoothed: Point | None = None
        last_smoothed_index: int | None = None
        velocity: Point = (0.0, 0.0)
        pending_gap = 0
        consecutive_missing = 0
        max_gap = 0
        n_detections = 0

        for frame_index, detections in enumerate(detections_per_frame):
            predicted = (
                (last_smoothed[0] + velocity[0], last_smoothed[1] + velocity[1])
                if last_smoothed is not None
                else None
            )
            candidate = self._select_detection(
                detections, predicted=predicted, gap_frames=max(1, pending_gap or 1)
            )
            if candidate is None:
                points[frame_index] = None
                consecutive_missing += 1
                max_gap = max(max_gap, consecutive_missing)
                if last_smoothed is not None:
                    pending_gap += 1
                    if pending_gap > self.max_gap_frames:
                        last_smoothed = None
                        last_smoothed_index = None
                        velocity = (0.0, 0.0)
                        pending_gap = 0
                continue

            consecutive_missing = 0
            if last_smoothed is None:
                smoothed = (candidate.x, candidate.y)
            else:
                alpha = self.smoothing_alpha
                smoothed = (
                    alpha * candidate.x + (1 - alpha) * last_smoothed[0],
                    alpha * candidate.y + (1 - alpha) * last_smoothed[1],
                )
                velocity = (
                    smoothed[0] - last_smoothed[0],
                    smoothed[1] - last_smoothed[1],
                )

            if (
                last_smoothed is not None
                and last_smoothed_index is not None
                and pending_gap > 0
                and pending_gap <= self.max_gap_frames
            ):
                for gap_idx in range(1, pending_gap + 1):
                    t = gap_idx / (pending_gap + 1)
                    interp = (
                        last_smoothed[0] + t * (smoothed[0] - last_smoothed[0]),
                        last_smoothed[1] + t * (smoothed[1] - last_smoothed[1]),
                    )
                    fill_index = last_smoothed_index + gap_idx
                    if 0 <= fill_index < len(points):
                        points[fill_index] = BallTrackPoint(
                            interp[0],
                            interp[1],
                            confidence=0.0,
                            is_interpolated=True,
                        )
            points[frame_index] = BallTrackPoint(
                smoothed[0],
                smoothed[1],
                confidence=candidate.confidence,
                is_interpolated=False,
            )
            last_smoothed = smoothed
            last_smoothed_index = frame_index
            pending_gap = 0
            n_detections += 1

        n_frames = len(points)
        n_missing = sum(1 for point in points if point is None)
        gap_ratio = n_missing / n_frames if n_frames else 0.0
        jitter_px = compute_jitter_px(
            [point.as_point() for point in points if point is not None]
        )
        return StabilizedTrack(
            points=points,
            n_frames=n_frames,
            n_detections=n_detections,
            n_missing=n_missing,
            max_gap=max_gap,
            gap_ratio=gap_ratio,
            jitter_px=jitter_px,
        )

    def _select_detection(
        self,
        detections: Sequence[BallDetection],
        *,
        predicted: Point | None,
        gap_frames: int,
    ) -> BallDetection | None:
        if not detections:
            return None
        ordered = sorted(detections, key=lambda det: (-det.confidence, det.x, det.y))
        if predicted is None:
            return ordered[0]

        def distance(det: BallDetection) -> float:
            return ((det.x - predicted[0]) ** 2 + (det.y - predicted[1]) ** 2) ** 0.5

        best = min(
            ordered,
            key=lambda det: (
                distance(det),
                -det.confidence,
                det.x,
                det.y,
            ),
        )
        dist = distance(best)
        if dist > self.outlier_distance:
            return None
        if gap_frames > 0 and dist > self.gating_distance * gap_frames:
            return None
        return best


def stabilizer_from_env() -> BallTrackingStabilizer:
    return BallTrackingStabilizer(
        max_gap_frames=_env_int("TRACK_MAX_GAP_FRAMES", 4),
        gating_distance=_env_float("TRACK_GATING_DISTANCE_PX", 90.0),
        outlier_distance=_env_float("TRACK_OUTLIER_DISTANCE_PX", 140.0),
        smoothing_alpha=_env_float("TRACK_SMOOTHING_ALPHA", 0.45),
    )
