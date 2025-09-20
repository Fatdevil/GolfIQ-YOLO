from fastapi.testclient import TestClient

from server.api.main import app


def test_calibrate_measure_endpoint():
    with TestClient(app) as client:
        response = client.post(
            "/calibrate/measure",
            json={
                "p1x": 0.0,
                "p1y": 0.0,
                "p2x": 100.0,
                "p2y": 0.0,
                "ref_len_m": 1.0,
                "fps": 60.0,
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert abs(payload["meters_per_pixel"] - 0.01) < 1e-9
    assert payload["quality"] == "low_fps"
