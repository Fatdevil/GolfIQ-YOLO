from cv_engine.calibration.simple import measure_from_tracks
from cv_engine.metrics.kinematics import CalibrationParams


def test_slight_jitter_smoothed():
    calib = CalibrationParams.from_reference(1.0, 100.0, 120.0)
    clean = [(i * 2.0, 100 - i * 1.0) for i in range(20)]
    jitter = [
        (x + (1 if i % 5 == 0 else 0), y + (1 if i % 7 == 0 else 0))
        for i, (x, y) in enumerate(clean)
    ]
    club = [(i * 1.5, 110) for i in range(len(jitter))]
    m_clean = measure_from_tracks(clean, club, calib)
    m_jit = measure_from_tracks(jitter, club, calib)
    # borde inte avvika för mycket
    assert abs(m_clean.launch_deg - m_jit.launch_deg) <= 2.0
