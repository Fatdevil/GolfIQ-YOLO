from __future__ import annotations

import json

from fastapi.testclient import TestClient

from server.app import app


def _client():
    return TestClient(app)


def _admin_headers(token: str) -> dict[str, str]:
    return {"x-admin-token": token}


def test_get_config_defaults_when_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))

    client = _client()
    response = client.get(
        "/api/admin/feature-flags/config",
        headers=_admin_headers("secret"),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["roundFlowV2"]["rolloutPercent"] == 0
    assert payload["roundFlowV2"]["allowlist"] == []
    assert payload["roundFlowV2"]["force"] is None
    assert payload["meta"]["updatedAt"] is None
    assert payload["meta"]["updatedBy"] is None


def test_put_updates_and_persists(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))

    client = _client()
    response = client.put(
        "/api/admin/feature-flags/config",
        headers=_admin_headers("secret"),
        json={
            "roundFlowV2": {
                "rolloutPercent": 25,
                "allowlist": ["member-a", "member-b"],
                "force": "force_on",
            }
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["roundFlowV2"]["rolloutPercent"] == 25
    assert payload["roundFlowV2"]["allowlist"] == ["member-a", "member-b"]
    assert payload["roundFlowV2"]["force"] == "force_on"
    assert payload["meta"]["updatedAt"] is not None
    assert payload["meta"]["updatedBy"] == "admin:secret"

    follow_up = client.get(
        "/api/admin/feature-flags/config",
        headers=_admin_headers("secret"),
    )
    assert follow_up.status_code == 200
    follow_payload = follow_up.json()
    assert follow_payload["roundFlowV2"]["rolloutPercent"] == 25
    assert follow_payload["roundFlowV2"]["allowlist"] == ["member-a", "member-b"]
    assert follow_payload["roundFlowV2"]["force"] == "force_on"

    stored = json.loads(config_path.read_text())
    assert stored["roundFlowV2"]["rolloutPercent"] == 25


def test_invalid_rollout_percent(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))

    client = _client()
    response = client.put(
        "/api/admin/feature-flags/config",
        headers=_admin_headers("secret"),
        json={"roundFlowV2": {"rolloutPercent": 120}},
    )

    assert response.status_code == 422


def test_invalid_token_rejected(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))

    client = _client()
    response = client.get("/api/admin/feature-flags/config")
    assert response.status_code == 401


def test_allowlist_add_remove(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))

    client = _client()
    added = client.post(
        "/api/admin/feature-flags/roundFlowV2/allowlist:add",
        headers=_admin_headers("secret"),
        json={"memberId": "member-1"},
    )
    assert added.status_code == 200
    assert added.json()["roundFlowV2"]["allowlist"] == ["member-1"]

    removed = client.post(
        "/api/admin/feature-flags/roundFlowV2/allowlist:remove",
        headers=_admin_headers("secret"),
        json={"memberId": "member-1"},
    )
    assert removed.status_code == 200
    assert removed.json()["roundFlowV2"]["allowlist"] == []


def test_feature_flags_use_config_store(monkeypatch, tmp_path):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    config_path = tmp_path / "feature_flags_config.json"
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))
    config_path.write_text(
        json.dumps(
            {
                "roundFlowV2": {
                    "rolloutPercent": 100,
                    "allowlist": [],
                    "force": None,
                },
                "meta": {"updatedAt": "2025-01-01T00:00:00Z", "updatedBy": "admin:test"},
            }
        )
    )
    monkeypatch.setenv("ROUND_FLOW_V2_ROLLOUT_PCT", "0")

    client = _client()
    response = client.get("/api/feature-flags", headers={"x-user-id": "member-999"})
    assert response.status_code == 200
    flags = response.json()["flags"]
    assert flags["roundFlowV2"]["rolloutPct"] == 100
    assert flags["roundFlowV2"]["enabled"] is True
