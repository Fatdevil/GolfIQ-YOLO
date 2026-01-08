from fastapi.testclient import TestClient

from server.app import app


def test_cv_mock_analyze_detector_mode():
    with TestClient(app) as client:
        payload = {
            "mode": "detector",
            "frames": 10,
            "fps": 120.0,
            "ref_len_m": 1.0,
            "ref_len_px": 100.0,
            "ball_dx_px": 2.0,
            "ball_dy_px": -1.0,
            "club_dx_px": 1.5,
            "club_dy_px": 0.0,
        }
        r = client.post("/cv/mock/analyze", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    m = data["metrics"]
    assert abs(m["ball_speed_mps"] - 2.41) < 0.25
    assert 5.3 <= m["ball_speed_mph"] <= 5.5
    assert 32.0 <= m["launch_deg"] <= 34.5
