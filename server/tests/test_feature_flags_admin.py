from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from server.app import app


def _admin_headers(token: str) -> dict[str, str]:
    return {"x-admin-token": token, "Origin": "http://testserver"}


def test_admin_get_defaults_when_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    monkeypatch.setenv(
        "FEATURE_FLAGS_CONFIG_PATH", str(tmp_path / "feature_flags_config.json")
    )

    client = TestClient(app)
    response = client.get(
        "/api/admin/feature-flags/config", headers=_admin_headers("secret")
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["roundFlowV2"] == {
        "rolloutPercent": 0,
        "allowlist": [],
        "force": None,
    }
    assert payload["meta"] == {"updatedAt": None, "updatedBy": None}


def test_admin_put_persists_updates(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))

    client = TestClient(app)
    payload = {
        "roundFlowV2": {
            "rolloutPercent": 25,
            "allowlist": ["member-1", "member-2"],
            "force": "force_on",
        }
    }
    response = client.put(
        "/api/admin/feature-flags/config",
        headers=_admin_headers("secret"),
        json=payload,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["roundFlowV2"]["rolloutPercent"] == 25
    assert body["roundFlowV2"]["allowlist"] == ["member-1", "member-2"]
    assert body["roundFlowV2"]["force"] == "force_on"
    assert body["meta"]["updatedAt"]
    assert body["meta"]["updatedBy"].startswith("admin:")
    assert config_path.exists()

    followup = client.get(
        "/api/admin/feature-flags/config", headers=_admin_headers("secret")
    )
    assert followup.status_code == 200
    assert followup.json()["roundFlowV2"]["rolloutPercent"] == 25

    persisted = json.loads(config_path.read_text(encoding="utf-8"))
    assert persisted["roundFlowV2"]["rolloutPercent"] == 25


def test_admin_put_invalid_rollout_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    monkeypatch.setenv(
        "FEATURE_FLAGS_CONFIG_PATH", str(tmp_path / "feature_flags_config.json")
    )

    client = TestClient(app)
    response = client.put(
        "/api/admin/feature-flags/config",
        headers=_admin_headers("secret"),
        json={"roundFlowV2": {"rolloutPercent": 200}},
    )
    assert response.status_code == 422


def test_admin_invalid_token_rejected(tmp_path, monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    monkeypatch.setenv(
        "FEATURE_FLAGS_CONFIG_PATH", str(tmp_path / "feature_flags_config.json")
    )

    client = TestClient(app)
    response = client.get(
        "/api/admin/feature-flags/config", headers=_admin_headers("wrong")
    )
    assert response.status_code == 401
