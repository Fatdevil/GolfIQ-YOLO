from __future__ import annotations

from typing import Iterable, Sequence

import pytest

from cv_engine.calibration.types import TrackPoint
from cv_engine.tracking.stabilizer import StabilizerConfig, stabilize_ball_track


def _linear_track(
    n: int, *, dx: float = 2.0, dy: float = -1.0
) -> list[tuple[float, float]]:
    return [(10.0 + i * dx, 120.0 + i * dy) for i in range(n)]


def _track_points_from_line(
    points: Sequence[tuple[float, float]],
    *,
    jitter: float = 0.0,
    missing: Iterable[int] = (),
    outliers: dict[int, tuple[float, float, float]] | None = None,
) -> list[TrackPoint]:
    missing_set = set(missing)
    outliers = outliers or {}
    track_points: list[TrackPoint] = []
    for idx, (x, y) in enumerate(points):
        if idx in missing_set:
            continue
        if idx in outliers:
            ox, oy, conf = outliers[idx]
            track_points.append(
                TrackPoint(
                    frame_idx=idx,
                    x_px=ox,
                    y_px=oy,
                    confidence=conf,
                )
            )
            continue
        jitter_offset = jitter * (1 if idx % 2 == 0 else -1)
        track_points.append(
            TrackPoint(
                frame_idx=idx,
                x_px=x,
                y_px=y + jitter_offset,
                confidence=0.9,
            )
        )
    return track_points


def _average_step(points: Sequence[TrackPoint]) -> float:
    if len(points) < 2:
        return 0.0
    distances = []
    for prev, current in zip(points, points[1:]):
        dx = current.x_px - prev.x_px
        dy = current.y_px - prev.y_px
        distances.append((dx**2 + dy**2) ** 0.5)
    return sum(distances) / len(distances)


def _signature(
    points: Sequence[TrackPoint],
) -> list[tuple[int, float, float, float | None, bool]]:
    return [
        (pt.frame_idx, pt.x_px, pt.y_px, pt.confidence, pt.is_interpolated)
        for pt in points
    ]


def test_stabilizer_reduces_jitter() -> None:
    base = _linear_track(12)
    track_points = _track_points_from_line(base, jitter=3.5)
    config = StabilizerConfig(ema_alpha=0.4)

    raw_step = _average_step(track_points)
    stabilized = stabilize_ball_track(track_points, config, total_frames=len(base))
    stabilized_step = _average_step(stabilized.points)

    assert stabilized_step < raw_step


def test_stabilizer_interpolates_short_gaps() -> None:
    base = _linear_track(20)
    track_points = _track_points_from_line(base, missing=[10, 11, 12])
    config = StabilizerConfig(max_gap_frames=3)

    stabilized = stabilize_ball_track(track_points, config, total_frames=len(base))
    by_frame = {pt.frame_idx: pt for pt in stabilized.points}

    assert by_frame[10].is_interpolated
    assert by_frame[11].is_interpolated
    assert by_frame[12].is_interpolated


def test_stabilizer_rejects_outlier_jump() -> None:
    base = _linear_track(12)
    track_points = _track_points_from_line(
        base,
        outliers={6: (2000.0, -1800.0, 0.1)},
    )
    config = StabilizerConfig(max_gap_frames=2, max_px_per_frame=8.0, min_conf=0.5)

    stabilized = stabilize_ball_track(track_points, config, total_frames=len(base))
    by_frame = {pt.frame_idx: pt for pt in stabilized.points}

    outlier_point = by_frame[6]
    assert outlier_point.is_interpolated
    expected_x, expected_y = base[6]
    assert abs(outlier_point.x_px - expected_x) < 5.0
    assert abs(outlier_point.y_px - expected_y) < 5.0


def test_stabilizer_is_deterministic() -> None:
    base = _linear_track(10)
    track_points = _track_points_from_line(base, missing=[2], jitter=2.0)
    config = StabilizerConfig()

    first = stabilize_ball_track(track_points, config, total_frames=len(base))
    second = stabilize_ball_track(track_points, config, total_frames=len(base))

    assert _signature(first.points) == _signature(second.points)


def test_stabilizer_fills_and_reports_metrics() -> None:
    base = _linear_track(8)
    track_points = _track_points_from_line(base, missing=[2])
    config = StabilizerConfig(max_gap_frames=2)

    stabilized = stabilize_ball_track(track_points, config, total_frames=len(base))

    assert stabilized.filled_frames >= 1
    assert stabilized.n_missing == 0
    assert stabilized.gap_ratio == pytest.approx(0.0)
