from fastapi.testclient import TestClient

from server.app import app


def test_mock_motion_scoped_per_request():
    with TestClient(app) as client:
        req_one = {
            "mode": "detector",
            "ball_dx_px": 2.0,
            "ball_dy_px": -1.0,
            "club_dx_px": 1.5,
            "club_dy_px": 0.0,
        }
        first = client.post("/cv/mock/analyze", json=req_one)
        assert first.status_code == 200
        req_two = {
            "mode": "detector",
            "ball_dx_px": 4.0,
            "ball_dy_px": -2.5,
            "club_dx_px": 3.0,
            "club_dy_px": -1.0,
        }
        second = client.post("/cv/mock/analyze", json=req_two)
        assert second.status_code == 200
    metrics_one = first.json()["metrics"]
    metrics_two = second.json()["metrics"]
    assert metrics_one["ball_speed_mps"] != metrics_two["ball_speed_mps"]
