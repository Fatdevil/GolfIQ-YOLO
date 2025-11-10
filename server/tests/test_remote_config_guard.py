"""Ensure remote config endpoint enforces admin token and stores values."""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
import server.config.remote as remote


client = TestClient(app)


def test_remote_update_requires_token(monkeypatch):
    """Missing admin token should be rejected."""

    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    response = client.post("/config/remote", json={"foo": "bar"})
    assert response.status_code == 503


def test_remote_update_ok(monkeypatch):
    """Providing the admin token should allow updates."""

    monkeypatch.setenv("ADMIN_TOKEN", "sekret")
    monkeypatch.setattr(remote, "_store", remote.RemoteConfigStore())
    with TestClient(app) as session:
        current = session.get("/config/remote").json()["config"]
        response = session.post(
            "/config/remote",
            json=current,
            headers={"x-admin-token": "sekret", "Origin": "http://testserver"},
        )
        assert response.status_code in (200, 201)
        payload = response.json()
        assert payload["config"] == current
        assert payload["etag"]
