from fastapi.testclient import TestClient

from server.app import app


def test_cv_mock_analyze_returns_metrics():
    client = TestClient(app)
    payload = {
        "frames": 10,
        "fps": 120.0,
        "ref_len_m": 1.0,
        "ref_len_px": 100.0,
        "ball_dx_px": 2.0,
        "ball_dy_px": -1.0,  # uppåt
        "club_dx_px": 1.5,
        "club_dy_px": 0.0,
    }
    r = client.post("/cv/mock/analyze", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "metrics" in data and "events" in data
    m = data["metrics"]
    # Hastigheten ~2.68 m/s (dx=2, dy=-1 px/frame; 1m=100px; 120 fps)
    assert abs(m["ball_speed_mps"] - 2.68) < 0.15
    # ~6.0 mph
    assert 5.7 <= m["ball_speed_mph"] <= 6.3
    # Vinkel ~26.6°
    assert 25.0 <= m["launch_deg"] <= 28.5
    # Carry positiv och rimlig för låg hastighet
    assert m["carry_m"] > 0.0
    assert "confidence" in m and 0.0 <= m["confidence"] <= 1.0
