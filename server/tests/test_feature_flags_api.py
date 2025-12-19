from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.feature_flags import bucket_user, get_feature_flags


def test_bucket_is_deterministic():
    assert bucket_user("practiceGrowthV1", "player123") == bucket_user(
        "practiceGrowthV1", "player123"
    )


@pytest.mark.parametrize(
    "rollout_pct,expected",
    [(0, False), (100, True)],
)
def test_rollout_extremes(rollout_pct: int, expected: bool, monkeypatch):
    monkeypatch.setenv("PRACTICE_GROWTH_V1_ROLLOUT_PCT", str(rollout_pct))
    flags = get_feature_flags("user-1")
    assert flags["practiceGrowthV1"].enabled is expected


@pytest.mark.parametrize("force_value,expected", [("on", True), ("off", False)])
def test_force_override(monkeypatch, force_value: str, expected: bool):
    monkeypatch.setenv("ROUND_FLOW_V2_ROLLOUT_PCT", "0")
    monkeypatch.setenv("ROUND_FLOW_V2_FORCE", force_value)
    flags = get_feature_flags("user-2")
    flag = flags["roundFlowV2"]
    assert flag.enabled is expected
    assert flag.source == "force"
    assert flag.reason in {"force_on", "force_off"}


def test_allowlist_overrides_percent(monkeypatch):
    monkeypatch.setenv("ROUND_FLOW_V2_ROLLOUT_PCT", "0")
    monkeypatch.setenv("ROUND_FLOW_V2_ALLOWLIST", "member-123,member-456")
    flags = get_feature_flags("member-456")
    flag = flags["roundFlowV2"]
    assert flag.enabled is True
    assert flag.source == "allowlist"
    assert flag.reason == "allowlist"


def test_percent_rollout_reason(monkeypatch):
    monkeypatch.setenv("ROUND_FLOW_V2_ROLLOUT_PCT", "100")
    monkeypatch.delenv("ROUND_FLOW_V2_FORCE", raising=False)
    monkeypatch.delenv("ROUND_FLOW_V2_ALLOWLIST", raising=False)
    flags = get_feature_flags("member-789")
    flag = flags["roundFlowV2"]
    assert flag.enabled is True
    assert flag.source == "rollout"
    assert flag.reason == "percent"


def test_forced_off_overrides_allowlist(monkeypatch):
    monkeypatch.setenv("ROUND_FLOW_V2_ROLLOUT_PCT", "100")
    monkeypatch.setenv("ROUND_FLOW_V2_ALLOWLIST", "member-999")
    monkeypatch.setenv("ROUND_FLOW_V2_FORCE", "off")
    flags = get_feature_flags("member-999")
    flag = flags["roundFlowV2"]
    assert flag.enabled is False
    assert flag.source == "force"
    assert flag.reason == "force_off"


def test_endpoint_returns_expected_schema(monkeypatch):
    monkeypatch.setenv("PRACTICE_GROWTH_V1_ROLLOUT_PCT", "10")
    monkeypatch.delenv("PRACTICE_GROWTH_V1_FORCE", raising=False)
    monkeypatch.setenv("ROUND_FLOW_V2_FORCE", "off")

    client = TestClient(app)
    response = client.get("/api/feature-flags", headers={"x-user-id": "abc-123"})
    assert response.status_code == 200

    payload = response.json()
    assert payload["version"] == 1
    flags = payload["flags"]
    assert set(flags.keys()) == {"practiceGrowthV1", "roundFlowV2"}

    practice_flag = flags["practiceGrowthV1"]
    assert set(practice_flag.keys()) == {"enabled", "rolloutPct", "source", "reason"}
    assert practice_flag["rolloutPct"] == 10

    round_flag = flags["roundFlowV2"]
    assert round_flag["rolloutPct"] == 0
    assert round_flag["source"] == "force"
    assert round_flag["reason"] == "force_off"


def test_config_store_overrides_env(monkeypatch, tmp_path):
    config_path = tmp_path / "feature_flags_config.json"
    config_path.write_text(
        json.dumps(
            {
                "roundFlowV2": {
                    "rolloutPercent": 100,
                    "allowlist": [],
                    "force": None,
                },
                "meta": {"updatedAt": "2024-01-01T00:00:00Z", "updatedBy": "admin:seed"},
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("FEATURE_FLAGS_CONFIG_PATH", str(config_path))
    monkeypatch.setenv("ROUND_FLOW_V2_ROLLOUT_PCT", "0")
    monkeypatch.setenv("ROUND_FLOW_V2_FORCE", "off")

    flags = get_feature_flags("member-123")
    flag = flags["roundFlowV2"]
    assert flag.enabled is True
    assert flag.rollout_pct == 100
    assert flag.source == "rollout"
