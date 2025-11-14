from __future__ import annotations

from fastapi.testclient import TestClient

from server.access import service
from server.app import app


def test_api_key_guard(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "s3cret")
    monkeypatch.delenv("GOLFIQ_PRO_API_KEYS", raising=False)
    service.reload_config()
    with TestClient(app) as client:
        resp = client.post("/cv/mock/analyze", json={})
        assert resp.status_code == 401
        ok = client.post("/cv/mock/analyze", json={}, headers={"x-api-key": "s3cret"})
        assert ok.status_code == 200


def test_api_key_guard_allows_pro_keys(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "base-key")
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "vip-key,other-pro")
    service.reload_config()

    with TestClient(app) as client:
        pro = client.post("/cv/mock/analyze", json={}, headers={"x-api-key": "vip-key"})
        assert pro.status_code == 200

        other = client.post("/cv/mock/analyze", json={}, headers={"x-api-key": "nope"})
        assert other.status_code == 401


def test_api_key_guard_disabled(monkeypatch):
    monkeypatch.setenv("API_KEY", "any")
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("GOLFIQ_PRO_API_KEYS", raising=False)
    service.reload_config()
    from server.security import require_api_key

    require_api_key(x_api_key=None)
