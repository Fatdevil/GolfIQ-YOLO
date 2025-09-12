import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from server.metrics.faceon import compute_faceon_metrics


def test_faceon_metrics_person_centered_cm():
    dets = [{"cls": "person", "bbox": [45, 10, 155, 210]}]
    out = compute_faceon_metrics(dets, frame_w=200, frame_h=240, mm_per_px=0.5)
    assert "sway_px" in out and isinstance(out["sway_px"], float)
    assert "sway_cm" in out and (
        out["sway_cm"] is None or isinstance(out["sway_cm"], float)
    )
    assert out["shoulder_tilt_deg"] == 0.0
    assert out["shaft_lean_deg"] == 0.0


def test_faceon_metrics_no_person():
    out = compute_faceon_metrics([], frame_w=200, frame_h=240, mm_per_px=None)
    assert out["notes"] == "no-person-detected"
