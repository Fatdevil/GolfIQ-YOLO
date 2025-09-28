from arhud.metrics import compute_anchor_confidence


def test_confidence_increases_with_tracking_quality():
    variance = 0.01
    tracking_quality_low = 0.3
    tracking_quality_high = 0.8
    base_time = 0.0
    low_conf = compute_anchor_confidence(variance, tracking_quality_low, base_time)
    high_conf = compute_anchor_confidence(variance, tracking_quality_high, base_time)
    assert high_conf > low_conf, "Confidence should increase with tracking quality"


def test_confidence_penalizes_time_since_reset():
    variance = 0.02
    tracking_quality = 0.7
    recent = compute_anchor_confidence(variance, tracking_quality, 0.1)
    old = compute_anchor_confidence(variance, tracking_quality, 3.0)
    assert recent > old, "Confidence should decay over time"
