from __future__ import annotations

import math
from types import SimpleNamespace
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


def test_get_remote_config_includes_wind_debug():
    with _client() as client:
        response = client.get(
            "/config/remote?pl_distance=150",
            headers={
                "x-pl-wind-slope": "on",
                "x-pl-wind": "speed=5;from=0",
            },
        )
        assert response.status_code == 200
        debug = response.json().get("debug", {}).get("playsLike", {}).get("windSlope")
        assert debug is not None
        assert debug["deltaHead_m"] == pytest.approx(-11.25, rel=1e-3)


def test_get_remote_config_debug_includes_target_and_slope_inputs():
    with _client() as client:
        response = client.get(
            "/config/remote",
            headers={
                "x-pl-wind-slope": "true",
                "x-pl-distance": "175",
                "x-pl-wind": "speed=4;from=270;target=180",
                "x-pl-slope": "dh=+12ft",
            },
        )

        assert response.status_code == 200
        debug = response.json().get("debug", {}).get("playsLike", {}).get("windSlope")
        assert debug is not None
        assert debug["baseDistance_m"] == pytest.approx(175.0)

        wind_input = debug["inputs"]["wind"]
        assert wind_input is not None
        assert wind_input["direction_deg_from"] == pytest.approx(270.0)
        assert wind_input["targetAzimuth_deg"] == pytest.approx(180.0)

        slope_input = debug["inputs"]["slope"]
        assert slope_input is not None
        assert slope_input["deltaHeight_m"] == pytest.approx(12 * 0.3048)

        # Crosswind with a target azimuth should yield a non-zero aim recommendation.
        assert debug["aimAdjust_deg"] is not None


def test_update_remote_config_overrides_and_persists(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    overrides: Dict[str, Dict[str, object]] = {
        "tierA": {"hudEnabled": True, "inputSize": 640},
        "tierB": {
            "hudEnabled": False,
            "inputSize": 240,
            "reducedRate": True,
            "analyticsEnabled": True,
        },
        "tierC": {"hudEnabled": False},
    }
    expected: Dict[str, Dict[str, object]] = {}
    for tier, defaults in remote.DEFAULT_REMOTE_CONFIG.items():
        merged = dict(defaults)
        merged.update(overrides[tier])
        expected[tier] = merged

    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    with _client() as client:
        update = client.post("/config/remote", json=overrides, headers=headers)
        assert update.status_code == 200
        updated = update.json()
        assert updated["config"] == expected
        assert update.headers["ETag"] == updated["etag"]

        fetched = client.get("/config/remote")
        assert fetched.status_code == 200
        assert fetched.json()["config"] == expected


def test_update_remote_config_merges_plays_like_overrides(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    plays_like_override = {
        "windModel": "percent_v1",
        "alphaHead_per_mph": 0.02,
        "alphaTail_per_mph": 0.0075,
        "slopeFactor": 1.5,
        "windCap_pctOfD": 0.15,
        "taperStart_mph": 18,
        "sidewindDistanceAdjust": True,
    }

    with _client() as client:
        first_update = client.post(
            "/config/remote",
            json={"tierA": {"playsLike": plays_like_override}},
            headers=headers,
        )
        assert first_update.status_code == 200
        payload = first_update.json()["config"]
        tier_a = payload["tierA"]["playsLike"]
        for key, value in plays_like_override.items():
            if key == "windModel":
                assert tier_a[key] == value
            elif key == "sidewindDistanceAdjust":
                assert tier_a[key] is True
            else:
                assert tier_a[key] == pytest.approx(float(value))

        partial_override = {"slopeFactor": 1.25}
        second_update = client.post(
            "/config/remote",
            json={"tierA": {"playsLike": partial_override}},
            headers=headers,
        )
        assert second_update.status_code == 200
        tier_a_after = second_update.json()["config"]["tierA"]["playsLike"]
        assert tier_a_after["slopeFactor"] == pytest.approx(1.25)
        # Values not provided in the partial override should retain their previous overrides.
        assert tier_a_after["alphaHead_per_mph"] == pytest.approx(0.02)
        assert tier_a_after["sidewindDistanceAdjust"] is True


def test_update_remote_config_sanitizes_profile_selection_and_scaling(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    payload = {
        "tierC": {
            "playsLikeProfileSelection": {"playerType": "amateur"},
            "playsLike": {
                "byClub": {
                    "wedge": {
                        "scaleHead": 1.2,
                        "scaleTail": 1.1,
                        "ignored": "skip",
                    }
                },
                "byPlayerType": None,
                "windCap_pctOfD": 0.18,
            },
        }
    }

    with _client() as client:
        response = client.post("/config/remote", json=payload, headers=headers)
        assert response.status_code == 200
        tier_c = response.json()["config"]["tierC"]
        assert tier_c["playsLikeProfileSelection"] == {
            "playerType": "amateur",
            "clubClass": None,
        }
        plays_like = tier_c["playsLike"]
        assert plays_like["windCap_pctOfD"] == pytest.approx(0.18)
        assert plays_like["byPlayerType"] is None
        wedge = plays_like["byClub"]["wedge"]
        assert wedge["scaleHead"] == pytest.approx(1.2)
        assert wedge["scaleTail"] == pytest.approx(1.1)
        assert "ignored" not in wedge
        wind_cfg = plays_like["wind"]
        assert wind_cfg["caps"]["perComponent"] == pytest.approx(0.15)
        assert wind_cfg["caps"]["total"] == pytest.approx(0.25)
        assert wind_cfg["enabled"] is False


def test_update_remote_config_allows_wind_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    payload = {
        "tierA": {
            "playsLike": {
                "wind": {
                    "enabled": True,
                    "head_per_mps": 0.02,
                    "slope_per_m": 0.8,
                    "caps": {"perComponent": 0.2, "total": 0.3},
                }
            }
        }
    }

    with _client() as client:
        response = client.post("/config/remote", json=payload, headers=headers)
        assert response.status_code == 200
        wind_cfg = response.json()["config"]["tierA"]["playsLike"]["wind"]
        assert wind_cfg["enabled"] is True
        assert wind_cfg["head_per_mps"] == pytest.approx(0.02)
        assert wind_cfg["slope_per_m"] == pytest.approx(0.8)
        assert wind_cfg["caps"]["perComponent"] == pytest.approx(0.2)
        assert wind_cfg["caps"]["total"] == pytest.approx(0.3)


def test_update_remote_config_validates_profile_selection(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    with _client() as client:
        bad_shape = client.post(
            "/config/remote",
            json={"tierA": {"playsLikeProfileSelection": ["tour"]}},
            headers=headers,
        )
        assert bad_shape.status_code == 422

        bad_value = client.post(
            "/config/remote",
            json={"tierA": {"playsLikeProfileSelection": {"playerType": 123}}},
            headers=headers,
        )
        assert bad_value.status_code == 422

        bad_profile = client.post(
            "/config/remote",
            json={"tierB": {"playsLikeProfile": 42}},
            headers=headers,
        )
        assert bad_profile.status_code == 422

        bad_scale = client.post(
            "/config/remote",
            json={
                "tierB": {"playsLike": {"byClub": {"driver": {"scaleHead": "fast"}}}}
            },
            headers=headers,
        )
        assert bad_scale.status_code == 422


def test_update_remote_config_validates_payload(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    with _client() as client:
        not_object = client.post("/config/remote", json=["nope"], headers=headers)
        assert not_object.status_code == 422

        partial_update = client.post(
            "/config/remote", json={"tierA": {"hudEnabled": True}}, headers=headers
        )
        assert partial_update.status_code == 200
        merged = partial_update.json()["config"]
        assert merged["tierA"]["hudEnabled"] is True
        assert merged["tierB"] == remote.DEFAULT_REMOTE_CONFIG["tierB"]
        assert merged["tierC"] == remote.DEFAULT_REMOTE_CONFIG["tierC"]

        not_dict = {"tierB": []}
        wrong_shape = client.post("/config/remote", json=not_dict, headers=headers)
        assert wrong_shape.status_code == 422

        bad_types = {
            "tierA": {"hudEnabled": True, "inputSize": "big"},
            "tierB": {"playsLike": {"alphaHead_per_mph": "fast"}},
        }
        invalid = client.post("/config/remote", json=bad_types, headers=headers)
        assert invalid.status_code == 422

        not_json = client.post(
            "/config/remote",
            data="not-json",
            headers={**headers, "Content-Type": "application/json"},
        )
        assert not_json.status_code == 400


def test_update_remote_config_requires_admin_token():
    with _client() as client:
        response = client.post(
            "/config/remote",
            json=remote.DEFAULT_REMOTE_CONFIG,
        )
        assert response.status_code == 503


def test_update_remote_config_rejects_invalid_admin_token(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("ADMIN_TOKEN", "expected")
    with _client() as client:
        response = client.post(
            "/config/remote",
            json=remote.DEFAULT_REMOTE_CONFIG,
            headers={"x-admin-token": "wrong", "Origin": "http://testserver"},
        )
        assert response.status_code == 401


def test_update_remote_config_blocks_cross_origin(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("ADMIN_TOKEN", "expected")
    with _client() as client:
        response = client.post(
            "/config/remote",
            json=remote.DEFAULT_REMOTE_CONFIG,
            headers={"x-admin-token": "expected", "Origin": "https://evil.example"},
        )
        assert response.status_code == 403


def test_sanitize_temp_alt_merges_base_and_overrides() -> None:
    base = {
        "enabled": True,
        "betaPerC": 0.002,
        "gammaPer100m": 0.008,
        "caps": {"perComponent": 0.15, "total": 0.22},
    }
    overrides = {"enabled": False, "gammaPer100m": 0.009, "caps": {"total": 0.3}}

    result = remote._sanitize_temp_alt(overrides, base)

    assert result["enabled"] is False
    assert result["betaPerC"] == pytest.approx(0.002)
    assert result["gammaPer100m"] == pytest.approx(0.009)
    assert result["caps"]["perComponent"] == pytest.approx(0.15)
    assert result["caps"]["total"] == pytest.approx(0.3)


def test_sanitize_temp_alt_caps_reset_to_defaults() -> None:
    base = {
        "enabled": False,
        "caps": {"perComponent": 0.11, "total": 0.19},
    }

    result = remote._sanitize_temp_alt({"caps": None}, base)

    assert result["caps"] == remote.DEFAULT_TEMP_ALT_CFG["caps"]


@pytest.mark.parametrize(
    "payload",
    [
        {"enabled": "yes"},
        {"betaPerC": "fast"},
        {"gammaPer100m": "slow"},
        {"caps": "oops"},
        {"caps": {"perComponent": "invalid"}},
        {"caps": {"total": "invalid"}},
    ],
)
def test_sanitize_temp_alt_rejects_invalid_overrides(
    payload: Dict[str, object],
) -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_temp_alt(payload)


def test_update_remote_config_handles_temp_alt_overrides(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}
    payload = {
        "tierA": {
            "playsLike": {
                "tempAlt": {
                    "enabled": True,
                    "betaPerC": 0.003,
                    "gammaPer100m": 0.007,
                    "caps": {"perComponent": 0.2, "total": 0.25},
                }
            }
        }
    }

    with _client() as client:
        response = client.post("/config/remote", json=payload, headers=headers)
        assert response.status_code == 200
        tier_a = response.json()["config"]["tierA"]["playsLike"]["tempAlt"]
        assert tier_a["enabled"] is True
        assert tier_a["betaPerC"] == pytest.approx(0.003)
        assert tier_a["gammaPer100m"] == pytest.approx(0.007)
        assert tier_a["caps"]["perComponent"] == pytest.approx(0.2)
        assert tier_a["caps"]["total"] == pytest.approx(0.25)


def test_update_remote_config_rejects_bad_temp_alt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}
    payload = {"tierB": {"playsLike": {"tempAlt": {"betaPerC": "oops"}}}}

    with _client() as client:
        response = client.post("/config/remote", json=payload, headers=headers)
        assert response.status_code == 422


def test_update_remote_config_rejects_bad_wind(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    headers = {"x-admin-token": "secret", "Origin": "http://testserver"}

    payload = {"tierB": {"playsLike": {"wind": "not-json"}}}

    with _client() as client:
        response = client.post("/config/remote", json=payload, headers=headers)
        assert response.status_code == 422


def test_sanitize_temp_alt_returns_base_without_overrides() -> None:
    base = {
        "enabled": True,
        "betaPerC": 0.002,
        "gammaPer100m": 0.007,
        "caps": {"perComponent": 0.2, "total": 0.25},
    }
    sanitized = remote._sanitize_temp_alt(None, base)
    assert sanitized["enabled"] is True
    assert sanitized["betaPerC"] == pytest.approx(0.002)
    assert sanitized["caps"]["perComponent"] == pytest.approx(0.2)


def test_sanitize_temp_alt_rejects_non_mapping() -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_temp_alt("invalid")


def test_sanitize_wind_handles_base_and_unknown_keys() -> None:
    base = {
        "enabled": True,
        "head_per_mps": 0.02,
        "cross_aim_deg_per_mps": 0.4,
        "caps": {"perComponent": 0.2, "total": 0.3},
    }
    sanitized = remote._sanitize_wind(None, base)
    assert sanitized["enabled"] is True
    assert sanitized["head_per_mps"] == pytest.approx(0.02)
    assert sanitized["caps"]["total"] == pytest.approx(0.3)

    overrides = {"caps": None, "custom": "value"}
    merged = remote._sanitize_wind(overrides, base)
    assert merged["caps"] == remote.DEFAULT_WIND_SLOPE_CFG["caps"]
    assert merged["custom"] == "value"


@pytest.mark.parametrize(
    "payload",
    [
        {"enabled": "yes"},
        {"head_per_mps": "fast"},
        {"slope_per_m": "slow"},
        {"caps": "oops"},
        {"caps": {"perComponent": "bad"}},
        {"caps": {"total": "bad"}},
    ],
)
def test_sanitize_wind_rejects_invalid_payloads(payload) -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_wind(payload)


def test_parse_distance_token_variants() -> None:
    assert remote._parse_distance_token(150) == pytest.approx(150.0)
    assert remote._parse_distance_token("200m") == pytest.approx(200.0)
    assert remote._parse_distance_token(" 175.5 ") == pytest.approx(175.5)
    assert remote._parse_distance_token("0") is None
    assert remote._parse_distance_token("-12") is None
    assert remote._parse_distance_token("abc") is None
    assert remote._parse_distance_token("") is None
    assert remote._parse_distance_token(["nope"]) is None
    assert remote._parse_distance_token(math.inf) is None
    assert remote._parse_distance_token(None) is None


def test_sanitize_ui_validations() -> None:
    assert remote._sanitize_ui({"other": "ignored"}) == remote.DEFAULT_UI_CONFIG
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_ui("invalid")
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_ui({"playsLikeVariant": 123})
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_ui({"playsLikeVariant": "beta"})


def test_profile_selection_skips_unknown_keys() -> None:
    base = {"playerType": None, "clubClass": None}
    overrides = {"playerType": "tour", "extra": "ignored"}
    result = remote.RemoteConfigStore._sanitize_profile_selection(overrides, base)
    assert result == {"playerType": "tour", "clubClass": None}


@pytest.mark.parametrize(
    "payload",
    [
        "invalid",
        {"windModel": 123},
        {"sidewindDistanceAdjust": "true"},
        {"byClub": "bad"},
        {"byClub": {"driver": "bad"}},
    ],
)
def test_sanitize_plays_like_rejects_bad_payloads(payload) -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._sanitize_plays_like(payload)


def test_sanitize_plays_like_handles_none_scales_and_custom_keys() -> None:
    overrides = {
        "byClub": {"driver": {"scaleHead": None, "scaleTail": 1.15}},
        "custom": "value",
    }
    result = remote.RemoteConfigStore._sanitize_plays_like(overrides)
    driver = result["byClub"]["driver"]
    assert "scaleHead" not in driver
    assert driver["scaleTail"] == pytest.approx(1.15)
    assert result["custom"] == "value"


def test_merge_tier_validates_current_profile_type() -> None:
    current = {"playsLikeProfile": 123}
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._merge_tier("tierA", current, None)


def test_merge_tier_applies_profile_and_ui_overrides() -> None:
    overrides = {
        "playsLikeProfile": "custom_profile",
        "ui": {"playsLikeVariant": "v1"},
    }
    result = remote.RemoteConfigStore._merge_tier("tierA", {}, overrides)
    assert result["playsLikeProfile"] == "custom_profile"
    assert result["ui"]["playsLikeVariant"] == "v1"


@pytest.mark.parametrize(
    "payload",
    [{"hudEnabled": "yes"}, {"inputSize": "large"}],
)
def test_merge_tier_rejects_invalid_types(payload) -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._merge_tier("tierA", {}, payload)


def test_validate_rejects_unsupported_tier() -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._validate({"tierX": {}}, remote.DEFAULT_REMOTE_CONFIG)


def test_require_admin_with_mismatched_origin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    request = SimpleNamespace(
        headers={"x-admin-token": "secret", "origin": "https://evil.example"},
        url=SimpleNamespace(scheme="https", netloc="golfiq.local"),
    )
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._require_admin(request)
