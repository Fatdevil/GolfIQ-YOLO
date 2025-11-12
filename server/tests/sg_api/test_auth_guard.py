from __future__ import annotations

from fastapi.testclient import TestClient

from server.api.routers.run_scores import _reset_state
from server.app import app


def test_run_sg_requires_api_key(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")
    _reset_state()

    with TestClient(app) as client:
        response = client.get("/api/runs/foo/sg")

    assert response.status_code in (401, 403)


def test_run_sg_accepts_valid_api_key(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "secret")
    _reset_state()

    with TestClient(app) as client:
        response = client.get("/api/runs/foo/sg", headers={"x-api-key": "secret"})

    assert response.status_code == 200
    body = response.json()
    assert body["total_sg"] == 0
    assert body["holes"] == []
