from __future__ import annotations

import os
import statistics
from dataclasses import dataclass
from typing import Sequence, Tuple

from cv_engine.calibration.types import TrackPoint
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
class StabilizerConfig:
    max_gap_frames: int = 4
    max_px_per_frame: float = 80.0
    base_gate: float = 20.0
    gate_radius_px: float = 30.0
    gate_speed_factor: float = 1.5
    ema_alpha: float = 0.45
    min_conf: float = 0.35
    link_max_distance: float = 120.0
    dist_weight: float = 1.0
    conf_weight: float = 10.0
    fallback_max_distance: float = 220.0


@dataclass
class StabilizedTrack:
    points: list[TrackPoint]
    n_frames: int
    n_detections: int
    n_missing: int
    max_gap: int
    gap_ratio: float
    jitter_px: float
    filled_frames: int
    outliers_removed: int
    segments_linked: int

    def as_points(self) -> list[Point]:
        return [point.as_point() for point in self.points]

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
            "filled_frames": int(self.filled_frames),
            "outliers_removed": int(self.outliers_removed),
            "segments_linked": int(self.segments_linked),
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


def _gate_radius(dt: int, cfg: StabilizerConfig) -> float:
    return cfg.base_gate + cfg.max_px_per_frame * dt


def _selection_gate_radius(
    *,
    speed_px_per_frame: float,
    dt: int,
    cfg: StabilizerConfig,
    speed_known: bool,
) -> float:
    if not speed_known or speed_px_per_frame <= 0.0:
        return _gate_radius(dt, cfg)
    adaptive = cfg.base_gate + cfg.gate_speed_factor * speed_px_per_frame * dt
    return max(cfg.gate_radius_px, adaptive)


def _predict_next_xy(
    points: Sequence[TrackPoint],
    *,
    frame_index: int,
) -> tuple[Point | None, float, int, bool]:
    if not points:
        return None, 0.0, 1, False
    last = points[-1]
    dt = max(frame_index - last.frame_idx, 1)
    if len(points) < 2:
        return (last.x_px, last.y_px), 0.0, dt, False

    prev = points[-2]
    prev_dt = max(last.frame_idx - prev.frame_idx, 1)
    velocity = (
        (last.x_px - prev.x_px) / prev_dt,
        (last.y_px - prev.y_px) / prev_dt,
    )
    predicted = (
        last.x_px + velocity[0] * dt,
        last.y_px + velocity[1] * dt,
    )
    speed = (velocity[0] ** 2 + velocity[1] ** 2) ** 0.5
    return predicted, speed, dt, True


def _select_detection(
    detections: Sequence[BallDetection],
    *,
    predicted: Point | None,
    cfg: StabilizerConfig,
    gate_radius_px: float,
) -> tuple[BallDetection | None, bool]:
    if not detections:
        return None, False

    ordered = sorted(detections, key=lambda det: (-det.confidence, det.x, det.y))
    if predicted is None:
        return ordered[0], False

    distances = {det: _distance_detection(det, predicted) for det in ordered}
    in_gate = [det for det in ordered if distances[det] <= gate_radius_px]

    def score(det: BallDetection) -> tuple[float, float, float, float, float]:
        dist = distances[det]
        combined = cfg.dist_weight * dist + cfg.conf_weight * (1 - det.confidence)
        return (combined, dist, -det.confidence, det.x, det.y)

    if in_gate:
        return min(in_gate, key=score), False

    best = ordered[0]
    if distances[best] <= cfg.fallback_max_distance:
        return best, True
    return None, False


def detections_to_track_points(
    detections_per_frame: Sequence[Sequence[BallDetection]],
    cfg: StabilizerConfig | None = None,
    *,
    debug: dict[str, int] | None = None,
) -> list[TrackPoint]:
    cfg = cfg or StabilizerConfig()
    points: list[TrackPoint] = []
    for frame_index, detections in enumerate(detections_per_frame):
        if not detections:
            continue

        predicted, speed, dt, speed_known = _predict_next_xy(
            points,
            frame_index=frame_index,
        )
        gate_radius_px = (
            _selection_gate_radius(
                speed_px_per_frame=speed,
                dt=dt,
                cfg=cfg,
                speed_known=speed_known,
            )
            if predicted is not None
            else cfg.gate_radius_px
        )

        best, fell_back = _select_detection(
            detections,
            predicted=predicted,
            cfg=cfg,
            gate_radius_px=gate_radius_px,
        )
        if best is None:
            continue
        if fell_back and debug is not None:
            debug["detection_gate_fallbacks"] = (
                debug.get(
                    "detection_gate_fallbacks",
                    0,
                )
                + 1
            )
        points.append(
            TrackPoint(
                frame_idx=frame_index,
                x_px=best.x,
                y_px=best.y,
                confidence=best.confidence,
            )
        )
    return points


def stabilize_ball_track(
    points: Sequence[TrackPoint],
    cfg: StabilizerConfig | None = None,
    *,
    total_frames: int | None = None,
) -> StabilizedTrack:
    cfg = cfg or StabilizerConfig()
    if not points:
        n_frames = total_frames or 0
        return StabilizedTrack(
            points=[],
            n_frames=n_frames,
            n_detections=0,
            n_missing=n_frames,
            max_gap=0,
            gap_ratio=0.0 if n_frames == 0 else 1.0,
            jitter_px=0.0,
            filled_frames=0,
            outliers_removed=0,
            segments_linked=0,
        )

    ordered = _dedupe_points(points)
    segments: list[list[TrackPoint]] = []
    current_segment: list[TrackPoint] = []
    last_smoothed: Point | None = None
    last_frame: int | None = None
    velocity: Point = (0.0, 0.0)
    filled_frames = 0
    outliers_removed = 0
    max_gap = 0

    for point in ordered:
        if last_frame is None:
            smoothed = (point.x_px, point.y_px)
            current_segment.append(
                TrackPoint(
                    frame_idx=point.frame_idx,
                    x_px=smoothed[0],
                    y_px=smoothed[1],
                    confidence=point.confidence,
                    is_interpolated=False,
                )
            )
            last_smoothed = smoothed
            last_frame = point.frame_idx
            velocity = (0.0, 0.0)
            continue

        dt = point.frame_idx - last_frame
        if dt <= 0:
            continue

        predicted = (
            last_smoothed[0] + velocity[0] * dt,
            last_smoothed[1] + velocity[1] * dt,
        )
        distance = _distance_point(point, predicted)
        if distance > _gate_radius(dt, cfg):
            outliers_removed += 1
            continue

        if last_smoothed is None:
            smoothed = (point.x_px, point.y_px)
        else:
            alpha = cfg.ema_alpha
            smoothed = (
                alpha * point.x_px + (1 - alpha) * last_smoothed[0],
                alpha * point.y_px + (1 - alpha) * last_smoothed[1],
            )

        gap = dt - 1
        if gap > 0:
            max_gap = max(max_gap, gap)
            if gap <= cfg.max_gap_frames:
                filled_frames += _fill_gap(
                    current_segment,
                    last_smoothed,
                    smoothed,
                    last_frame,
                    gap,
                )
            else:
                if current_segment:
                    segments.append(current_segment)
                current_segment = []
                last_smoothed = None
                velocity = (0.0, 0.0)
                smoothed = (point.x_px, point.y_px)

        current_segment.append(
            TrackPoint(
                frame_idx=point.frame_idx,
                x_px=smoothed[0],
                y_px=smoothed[1],
                confidence=point.confidence,
                is_interpolated=False,
            )
        )
        if last_smoothed is not None:
            velocity = (
                (smoothed[0] - last_smoothed[0]) / dt,
                (smoothed[1] - last_smoothed[1]) / dt,
            )
        last_smoothed = smoothed
        last_frame = point.frame_idx

    if current_segment:
        segments.append(current_segment)

    segments, linked, filled_linked = _link_segments(segments, cfg)
    filled_frames += filled_linked

    selected = _select_segment(segments)
    n_frames = total_frames or _frame_span(selected)
    n_missing = max(n_frames - len(selected), 0)
    gap_ratio = n_missing / n_frames if n_frames else 0.0
    jitter_px = compute_jitter_px([pt.as_point() for pt in selected])
    n_detections = sum(1 for pt in selected if not pt.is_interpolated)

    return StabilizedTrack(
        points=selected,
        n_frames=n_frames,
        n_detections=n_detections,
        n_missing=n_missing,
        max_gap=max_gap,
        gap_ratio=gap_ratio,
        jitter_px=jitter_px,
        filled_frames=filled_frames,
        outliers_removed=outliers_removed,
        segments_linked=linked,
    )


def _dedupe_points(points: Sequence[TrackPoint]) -> list[TrackPoint]:
    ordered = sorted(
        points,
        key=lambda pt: (
            pt.frame_idx,
            -(pt.confidence or 0.0),
            pt.x_px,
            pt.y_px,
        ),
    )
    seen: set[int] = set()
    deduped: list[TrackPoint] = []
    for point in ordered:
        if point.frame_idx in seen:
            continue
        deduped.append(point)
        seen.add(point.frame_idx)
    return deduped


def _fill_gap(
    segment: list[TrackPoint],
    start: Point,
    end: Point,
    start_frame: int,
    gap: int,
) -> int:
    filled = 0
    for gap_idx in range(1, gap + 1):
        t = gap_idx / (gap + 1)
        interp = (
            start[0] + t * (end[0] - start[0]),
            start[1] + t * (end[1] - start[1]),
        )
        segment.append(
            TrackPoint(
                frame_idx=start_frame + gap_idx,
                x_px=interp[0],
                y_px=interp[1],
                confidence=0.0,
                is_interpolated=True,
            )
        )
        filled += 1
    return filled


def _link_segments(
    segments: list[list[TrackPoint]],
    cfg: StabilizerConfig,
) -> tuple[list[list[TrackPoint]], int, int]:
    if len(segments) <= 1:
        return segments, 0, 0

    linked = 0
    filled_frames = 0
    merged: list[list[TrackPoint]] = [segments[0]]
    for segment in segments[1:]:
        prev = merged[-1]
        if not prev or not segment:
            merged.append(segment)
            continue
        end = prev[-1]
        start = segment[0]
        gap = start.frame_idx - end.frame_idx - 1
        if gap <= 0:
            prev.extend(segment)
            continue

        distance = _distance_points(end, start)
        direction = _segment_direction(prev)
        confidence = start.confidence if start.confidence is not None else 1.0
        if (
            gap <= cfg.max_gap_frames * 2
            and distance <= cfg.link_max_distance * (gap + 1)
            and confidence >= cfg.min_conf
            and _direction_plausible(direction, end, start)
        ):
            filled_frames += _fill_gap(
                prev,
                (end.x_px, end.y_px),
                (start.x_px, start.y_px),
                end.frame_idx,
                gap,
            )
            prev.extend(segment)
            linked += 1
        else:
            merged.append(segment)
    return merged, linked, filled_frames


def _segment_direction(segment: Sequence[TrackPoint]) -> Point | None:
    if len(segment) < 2:
        return None
    prev = segment[-2]
    last = segment[-1]
    return (last.x_px - prev.x_px, last.y_px - prev.y_px)


def _direction_plausible(
    direction: Point | None,
    end: TrackPoint,
    start: TrackPoint,
) -> bool:
    if direction is None:
        return True
    link_vec = (start.x_px - end.x_px, start.y_px - end.y_px)
    return direction[0] * link_vec[0] + direction[1] * link_vec[1] >= 0.0


def _select_segment(segments: Sequence[Sequence[TrackPoint]]) -> list[TrackPoint]:
    if not segments:
        return []
    return list(max(segments, key=lambda seg: (len(seg), -(seg[0].frame_idx))))


def _frame_span(points: Sequence[TrackPoint]) -> int:
    if not points:
        return 0
    return points[-1].frame_idx - points[0].frame_idx + 1


def _distance_point(point: TrackPoint, predicted: Point) -> float:
    return ((point.x_px - predicted[0]) ** 2 + (point.y_px - predicted[1]) ** 2) ** 0.5


def _distance_detection(det: BallDetection, predicted: Point) -> float:
    return ((det.x - predicted[0]) ** 2 + (det.y - predicted[1]) ** 2) ** 0.5


def _distance_points(first: TrackPoint, second: TrackPoint) -> float:
    return ((first.x_px - second.x_px) ** 2 + (first.y_px - second.y_px) ** 2) ** 0.5


def stabilizer_config_from_env() -> StabilizerConfig:
    return StabilizerConfig(
        max_gap_frames=_env_int("TRACK_MAX_GAP_FRAMES", 4),
        max_px_per_frame=_env_float(
            "TRACK_MAX_PX_PER_FRAME",
            _env_float("TRACK_GATING_DISTANCE_PX", 90.0),
        ),
        base_gate=_env_float("TRACK_BASE_GATE_PX", 20.0),
        gate_radius_px=_env_float("TRACK_GATE_RADIUS_PX", 30.0),
        gate_speed_factor=_env_float("TRACK_GATE_SPEED_FACTOR", 1.5),
        ema_alpha=_env_float("TRACK_SMOOTHING_ALPHA", 0.45),
        min_conf=_env_float("TRACK_MIN_CONF", 0.35),
        link_max_distance=_env_float(
            "TRACK_LINK_MAX_DISTANCE_PX",
            _env_float("TRACK_OUTLIER_DISTANCE_PX", 140.0),
        ),
        dist_weight=_env_float("TRACK_DIST_WEIGHT", 1.0),
        conf_weight=_env_float("TRACK_CONF_WEIGHT", 10.0),
        fallback_max_distance=_env_float("TRACK_FALLBACK_MAX_DISTANCE_PX", 220.0),
    )


def stabilizer_from_env() -> StabilizerConfig:
    return stabilizer_config_from_env()


def track_points_from_env(points: Sequence[TrackPoint]) -> StabilizedTrack:
    return stabilize_ball_track(points, stabilizer_config_from_env())


def track_points_from_detections(
    detections_per_frame: Sequence[Sequence[BallDetection]],
) -> list[TrackPoint]:
    return detections_to_track_points(detections_per_frame)


def track_points_from_boxes(
    boxes_per_frame: Sequence[Sequence[Box]],
) -> list[TrackPoint]:
    detections = [
        [BallDetection.from_box(box) for box in boxes] for boxes in boxes_per_frame
    ]
    return detections_to_track_points(detections)
