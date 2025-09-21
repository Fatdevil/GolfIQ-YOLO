from fastapi.testclient import TestClient

from server.app import app


def test_short_track_returns_zero_and_placeholders():
    with TestClient(app) as client:
        payload = {
            "frames": 2,
            "fps": 120,
            "ball_dx_px": 0.001,
            "ball_dy_px": 0.0340625,
            "club_dx_px": 0.0,
            "club_dy_px": 0.0,
        }
        r = client.post("/cv/mock/analyze", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()["metrics"]
        for k in [
            "ball_speed_mps",
            "ball_speed_mph",
            "club_speed_mps",
            "launch_deg",
            "carry_m",
        ]:
            assert m[k] == 0 or m[k] == 0.0
        assert "metrics_version" in m
        assert "spin_rpm" in m and m["spin_rpm"] is None
