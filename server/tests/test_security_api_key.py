from fastapi.testclient import TestClient

from server.app import app


def test_api_key_guard(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "s3cret")
    with TestClient(app) as client:
        resp = client.post("/cv/mock/analyze", json={})
        assert resp.status_code == 401
        ok = client.post("/cv/mock/analyze", json={}, headers={"x-api-key": "s3cret"})
        assert ok.status_code == 200


def test_api_key_guard_disabled(monkeypatch):
    monkeypatch.setenv("API_KEY", "any")
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    from server.security import require_api_key

    require_api_key(x_api_key=None)
