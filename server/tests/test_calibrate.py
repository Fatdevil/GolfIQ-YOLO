from fastapi.testclient import TestClient

from server.api.main import app


def test_calibrate_endpoint():
    c = TestClient(app)
    r = c.get("/calibrate?a4_width_px=500.0")
    assert r.status_code == 200
    assert abs(r.json()["scale_m_per_px"] - (0.210 / 500.0)) < 1e-9
