from fastapi.testclient import TestClient

from server.api.main import app


def test_no_api_key_required_by_default():
    c = TestClient(app)
    # Health is always open
    r = c.get("/health")
    assert r.status_code == 200
