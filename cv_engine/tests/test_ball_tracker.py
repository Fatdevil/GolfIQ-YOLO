from cv_engine.tracking.ball_tracker import StabilizedBallTracker
from cv_engine.tracking.norfair import NorfairTracker
from cv_engine.types import Box


def _box_at(x: float, y: float, score: float = 0.9) -> Box:
    return Box(
        x1=int(x - 1),
        y1=int(y - 1),
        x2=int(x + 1),
        y2=int(y + 1),
        label="ball",
        score=score,
    )


def test_ball_tracker_recovers_dropouts():
    tracker = StabilizedBallTracker(
        tracker=NorfairTracker(distance_threshold=50.0),
        max_gap_frames=3,
        gating_distance=80.0,
        outlier_distance=120.0,
        smoothing_alpha=0.5,
    )

    frames = [
        [_box_at(10, 10)],
        [_box_at(12, 12)],
        [],
        [],
        [_box_at(14, 14)],
        [_box_at(16, 16)],
    ]

    outputs = []
    for detections in frames:
        result = tracker.update(detections)
        if result is not None:
            outputs.append(result.center)

    metrics = tracker.metrics
    assert metrics.track_breaks == 1
    assert metrics.max_gap_frames == 2
    assert metrics.id_switches == 0
    assert metrics.avg_confidence > 0.0
    assert len(outputs) == 4
