from __future__ import annotations

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Iterable, Mapping, Sequence, Tuple

from cv_engine.types import Box

from .base import TrackUpdate, TrackerBase
from .bytetrack import ByteTrackTracker
from .identity import IdentityTracker
from .norfair import NorfairTracker


Point = Tuple[float, float]


@dataclass(frozen=True)
class BallTrackResult:
    track_id: int
    center: Point
    box: Box


@dataclass
class BallTrackingMetrics:
    track_breaks: int = 0
    max_gap_frames: int = 0
    id_switches: int = 0
    avg_confidence: float = 0.0

    def as_dict(self) -> Mapping[str, float | int]:
        return {
            "track_breaks": self.track_breaks,
            "max_gap_frames": self.max_gap_frames,
            "id_switches": self.id_switches,
            "avg_confidence": round(self.avg_confidence, 4),
        }


class BallTracker(ABC):
    """Interface for tracking a single ball trajectory with stabilization."""

    @abstractmethod
    def update(self, detections: Sequence[Box]) -> BallTrackResult | None:
        """Consume detections for the current frame and return a stabilized ball."""

    @abstractmethod
    def reset(self) -> None:
        """Reset tracker state."""

    @property
    @abstractmethod
    def metrics(self) -> BallTrackingMetrics:
        """Aggregated metrics across the run."""


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


_TRACKERS: dict[str, type[TrackerBase]] = {
    "norfair": NorfairTracker,
    "bytetrack": ByteTrackTracker,
    "identity": IdentityTracker,
}


class StabilizedBallTracker(BallTracker):
    """Ball tracker with gating + EMA smoothing for small, fast targets."""

    def __init__(
        self,
        *,
        tracker: TrackerBase,
        max_gap_frames: int = 4,
        gating_distance: float = 90.0,
        outlier_distance: float = 140.0,
        smoothing_alpha: float = 0.45,
    ) -> None:
        self._tracker = tracker
        self._max_gap_frames_allowed = max(0, int(max_gap_frames))
        self._gating_distance = float(gating_distance)
        self._outlier_distance = float(outlier_distance)
        self._smoothing_alpha = float(smoothing_alpha)
        self._metrics = BallTrackingMetrics()
        self.reset()

    @property
    def metrics(self) -> BallTrackingMetrics:
        return self._metrics

    def reset(self) -> None:
        self._tracker.reset()
        self._last_track_id: int | None = None
        self._last_center: Point | None = None
        self._smoothed_center: Point | None = None
        self._velocity: Point = (0.0, 0.0)
        self._gap_frames = 0
        self._confidence_sum = 0.0
        self._confidence_count = 0

    def _predict(self) -> Point | None:
        if self._smoothed_center is None:
            return None
        return (
            self._smoothed_center[0] + self._velocity[0],
            self._smoothed_center[1] + self._velocity[1],
        )

    def _select_candidate(
        self, tracked: Iterable[TrackUpdate]
    ) -> tuple[int, Box, float] | None:
        tracked_list = list(tracked)
        if not tracked_list:
            return None
        predicted = self._predict()
        if predicted is None:
            track_id, box = max(tracked_list, key=lambda item: item[1].score)
            return track_id, box, 0.0

        def distance(box: Box) -> float:
            cx, cy = box.center()
            return ((cx - predicted[0]) ** 2 + (cy - predicted[1]) ** 2) ** 0.5

        best = min(tracked_list, key=lambda item: distance(item[1]))
        return best[0], best[1], distance(best[1])

    def _register_gap(self) -> None:
        if self._gap_frames == 0 and self._last_center is not None:
            self._metrics.track_breaks += 1
        self._gap_frames += 1
        self._metrics.max_gap_frames = max(
            self._metrics.max_gap_frames, self._gap_frames
        )
        if self._gap_frames > self._max_gap_frames_allowed:
            self._last_track_id = None
            self._last_center = None
            self._smoothed_center = None
            self._velocity = (0.0, 0.0)

    def _update_metrics(self, track_id: int, box: Box) -> None:
        if self._last_track_id is not None and track_id != self._last_track_id:
            self._metrics.id_switches += 1
        self._last_track_id = track_id
        self._confidence_sum += float(box.score)
        self._confidence_count += 1
        if self._confidence_count > 0:
            self._metrics.avg_confidence = self._confidence_sum / self._confidence_count

    def update(self, detections: Sequence[Box]) -> BallTrackResult | None:
        tracked = self._tracker.update(detections)
        candidate = self._select_candidate(tracked)
        if candidate is None:
            self._register_gap()
            return None

        track_id, box, dist = candidate
        if self._smoothed_center is not None:
            gating = self._gating_distance * max(1, self._gap_frames or 1)
            if dist > self._outlier_distance:
                self._register_gap()
                return None
            if self._gap_frames > 0 and dist > gating:
                self._register_gap()
                return None

        center = box.center()
        if self._smoothed_center is None:
            smoothed = center
        else:
            alpha = self._smoothing_alpha
            smoothed = (
                alpha * center[0] + (1 - alpha) * self._smoothed_center[0],
                alpha * center[1] + (1 - alpha) * self._smoothed_center[1],
            )

        if self._smoothed_center is not None:
            self._velocity = (
                smoothed[0] - self._smoothed_center[0],
                smoothed[1] - self._smoothed_center[1],
            )

        self._smoothed_center = smoothed
        self._last_center = center
        self._gap_frames = 0
        self._update_metrics(track_id, box)
        return BallTrackResult(track_id=track_id, center=smoothed, box=box)


def build_ball_tracker(
    name: str | None = None,
    *,
    tracker_kwargs: Mapping[str, float] | None = None,
) -> BallTracker:
    if name is None:
        name = os.getenv("GOLFIQ_BALL_TRACKER", "norfair").strip().lower()
    tracker_cls = _TRACKERS.get(name, NorfairTracker)
    tracker = tracker_cls(**(tracker_kwargs or {}))
    return StabilizedBallTracker(
        tracker=tracker,
        max_gap_frames=_env_int("TRACK_MAX_GAP_FRAMES", 4),
        gating_distance=_env_float("TRACK_GATING_DISTANCE_PX", 90.0),
        outlier_distance=_env_float("TRACK_OUTLIER_DISTANCE_PX", 140.0),
        smoothing_alpha=_env_float("TRACK_SMOOTHING_ALPHA", 0.45),
    )
