from __future__ import annotations

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
    assert set(practice_flag.keys()) == {"enabled", "rolloutPct", "source"}
    assert practice_flag["rolloutPct"] == 10

    round_flag = flags["roundFlowV2"]
    assert round_flag["rolloutPct"] == 0
    assert round_flag["source"] == "force"
