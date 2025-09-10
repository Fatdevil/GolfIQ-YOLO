from fastapi.testclient import TestClient

from server.api.main import app


def test_health_ok():
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"
    assert "env" in data and "runtime" in data
