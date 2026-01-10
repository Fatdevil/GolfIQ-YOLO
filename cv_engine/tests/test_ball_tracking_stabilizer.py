from __future__ import annotations

from typing import Iterable, Sequence

from cv_engine.tracking.stabilizer import (
    BallDetection,
    BallTrackingStabilizer,
    compute_jitter_px,
)


def _linear_track(n: int, *, dx: float = 2.0, dy: float = -1.0) -> list[tuple[float, float]]:
    return [(10.0 + i * dx, 120.0 + i * dy) for i in range(n)]


def _detections_from_points(
    points: Sequence[tuple[float, float]],
    *,
    jitter: float = 0.0,
    missing: Iterable[int] = (),
    outliers: dict[int, tuple[float, float]] | None = None,
) -> list[list[BallDetection]]:
    missing_set = set(missing)
    outliers = outliers or {}
    detections: list[list[BallDetection]] = []
    for idx, (x, y) in enumerate(points):
        if idx in missing_set:
            detections.append([])
            continue
        if idx in outliers:
            ox, oy = outliers[idx]
            detections.append([BallDetection(ox, oy, 0.95)])
            continue
        jitter_offset = jitter * (1 if idx % 2 == 0 else -1)
        detections.append([BallDetection(x, y + jitter_offset, 0.9)])
    return detections


def _track_signature(points: Sequence) -> list[tuple[float, float, float, bool] | None]:
    signature: list[tuple[float, float, float, bool] | None] = []
    for point in points:
        if point is None:
            signature.append(None)
        else:
            signature.append(
                (point.x, point.y, point.confidence, point.is_interpolated)
            )
    return signature


def test_stabilizer_reduces_jitter() -> None:
    base = _linear_track(12)
    detections = _detections_from_points(base, jitter=3.5)
    stabilizer = BallTrackingStabilizer(smoothing_alpha=0.4)
    track = stabilizer.stabilize(detections)

    raw_points = [(det[0].x, det[0].y) for det in detections if det]
    raw_jitter = compute_jitter_px(raw_points)
    stabilized_jitter = track.jitter_px
    assert stabilized_jitter < raw_jitter


def test_stabilizer_interpolates_short_gaps() -> None:
    base = _linear_track(10)
    detections = _detections_from_points(base, missing=[3, 4])
    stabilizer = BallTrackingStabilizer(max_gap_frames=3)
    track = stabilizer.stabilize(detections)

    assert track.n_missing == 0
    assert track.points[3] is not None
    assert track.points[4] is not None
    assert track.points[3].is_interpolated
    assert track.points[4].is_interpolated


def test_stabilizer_rejects_outlier_jump() -> None:
    base = _linear_track(12)
    detections = _detections_from_points(
        base,
        outliers={6: (2000.0, -1800.0)},
    )
    stabilizer = BallTrackingStabilizer(max_gap_frames=2)
    track = stabilizer.stabilize(detections)

    outlier_point = track.points[6]
    assert outlier_point is not None
    assert outlier_point.is_interpolated
    expected_x, expected_y = base[6]
    assert abs(outlier_point.x - expected_x) < 5.0
    assert abs(outlier_point.y - expected_y) < 5.0


def test_stabilizer_caps_long_gaps() -> None:
    base = _linear_track(12)
    detections = _detections_from_points(base, missing=[4, 5, 6, 7])
    stabilizer = BallTrackingStabilizer(max_gap_frames=2)
    track = stabilizer.stabilize(detections)

    assert track.points[4] is None
    assert track.points[7] is None
    assert track.n_missing >= 4


def test_stabilizer_is_deterministic() -> None:
    base = _linear_track(10)
    detections = _detections_from_points(base, missing=[2], jitter=2.0)
    stabilizer = BallTrackingStabilizer()
    first = stabilizer.stabilize(detections)
    second = stabilizer.stabilize(detections)

    assert _track_signature(first.points) == _track_signature(second.points)
