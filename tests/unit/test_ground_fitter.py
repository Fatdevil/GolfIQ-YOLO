from arhud.ground_fitter import GroundFitter


def test_ground_fitter_returns_anchor_with_confidence():
    fitter = GroundFitter()
    anchor = fitter.update(
        plane_points=[(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.5, 0.0, 1.0)],
        tracking_quality=0.9,
        elapsed_since_reset=0.2,
    )
    assert 0.0 <= anchor.confidence <= 1.0
    assert abs(anchor.position[1]) < 0.1