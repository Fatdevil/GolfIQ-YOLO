from fastapi.testclient import TestClient

from ..api.main import app


def test_calibrate_endpoint():
    with TestClient(app) as c:
        r = c.get("/calibrate?a4_width_px=500.0")
        assert r.status_code == 200
        assert "scale_m_per_px" in r.json()
        assert abs(r.json()["scale_m_per_px"] - (0.210 / 500.0)) < 1e-9
