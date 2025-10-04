from __future__ import annotations

from typing import Dict

import pytest
from fastapi.testclient import TestClient

from server.app import app
import server.config.remote as remote


@pytest.fixture(autouse=True)
def reset_remote_store():
    remote._store = remote.RemoteConfigStore()
    yield
    remote._store = remote.RemoteConfigStore()


def _client() -> TestClient:
    return TestClient(app)


def test_get_remote_config_returns_defaults_and_etag():
    with _client() as client:
        response = client.get("/config/remote")
        assert response.status_code == 200
        payload = response.json()
        assert payload["config"] == remote.DEFAULT_REMOTE_CONFIG
        etag = response.headers["ETag"]
        assert payload["etag"] == etag

        cached = client.get("/config/remote", headers={"If-None-Match": etag})
        assert cached.status_code == 304
        assert cached.headers["ETag"] == etag


def test_update_remote_config_overrides_and_persists(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    overrides: Dict[str, Dict[str, object]] = {
        "tierA": {"hudEnabled": True, "inputSize": 640},
        "tierB": {"hudEnabled": False, "inputSize": 240, "reducedRate": True},
        "tierC": {"hudEnabled": False},
    }

    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    with _client() as client:
        update = client.post("/config/remote", json=overrides, headers=headers)
        assert update.status_code == 200
        updated = update.json()
        assert updated["config"] == overrides
        assert update.headers["ETag"] == updated["etag"]

        fetched = client.get("/config/remote")
        assert fetched.status_code == 200
        assert fetched.json()["config"] == overrides


def test_update_remote_config_validates_payload(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    with _client() as client:
        missing_tiers = client.post(
            "/config/remote", json={"tierA": {}}, headers=headers
        )
        assert missing_tiers.status_code == 422

        bad_types = {
            "tierA": {"hudEnabled": "yes", "inputSize": 320},
            "tierB": {"hudEnabled": True, "inputSize": "big", "reducedRate": True},
            "tierC": {"hudEnabled": False},
        }
        invalid = client.post("/config/remote", json=bad_types, headers=headers)
        assert invalid.status_code == 422

        not_json = client.post(
            "/config/remote",
            data="not-json",
            headers={**headers, "Content-Type": "application/json"},
        )
        assert not_json.status_code == 400
