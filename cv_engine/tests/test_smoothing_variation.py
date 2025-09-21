import statistics as st

from cv_engine.calibration.simple import measure_from_tracks
from cv_engine.metrics.kinematics import CalibrationParams


def _angle_series(track):
    import math

    ang = []
    for (x0, y0), (x1, y1) in zip(track, track[1:]):
        dx, dy = (x1 - x0), (y1 - y0)
        ang.append(math.degrees(math.atan2(-(dy), dx if dx != 0 else 1e-9)))
    return ang


def test_smoothing_reduces_angle_variation():
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)
    base = [(i * 2.0, 100 - i * 1.0) for i in range(25)]
    jitter = [
        (x + (1 if i % 3 == 0 else 0), y + (1 if i % 4 == 0 else 0))
        for i, (x, y) in enumerate(base)
    ]
    club = [(i * 1.5, 110) for i in range(len(jitter))]
    m1 = measure_from_tracks(jitter, club, calib)
    a1 = _angle_series(jitter)

    from cv_engine.metrics.smoothing import moving_average

    smooth = moving_average(jitter, window=5)
    a2 = _angle_series(smooth)
    assert st.pstdev(a2) <= st.pstdev(a1) * 0.85

    m0 = measure_from_tracks(base, club, calib)
    assert abs(m1.launch_deg - m0.launch_deg) <= 2.5
