from __future__ import annotations

from types import SimpleNamespace

import pytest

import server.config.remote as remote


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


def test_sanitize_temp_alt_requires_mapping() -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_temp_alt("invalid")


def test_sanitize_ui_handles_base_and_valid_overrides() -> None:
    base = {"playsLikeVariant": "V1"}
    sanitized = remote._sanitize_ui(None, base)
    assert sanitized["playsLikeVariant"] == "v1"

    overrides = {"playsLikeVariant": "OFF"}
    result = remote._sanitize_ui(overrides, base)
    assert result["playsLikeVariant"] == "off"


@pytest.mark.parametrize(
    "payload", ["invalid", {"playsLikeVariant": 123}, {"playsLikeVariant": "beta"}]
)
def test_sanitize_ui_rejects_invalid_payloads(payload) -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote._sanitize_ui(payload)


def test_sanitize_profile_selection_merges_base_and_overrides() -> None:
    base = {"playerType": "tour", "clubClass": None}
    overrides = {"playerType": "amateur"}
    result = remote.RemoteConfigStore._sanitize_profile_selection(overrides, base)
    assert result == {"playerType": "amateur", "clubClass": None}


def test_sanitize_profile_selection_validates_types() -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._sanitize_profile_selection("nope")
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._sanitize_profile_selection({"playerType": 123})


def test_sanitize_plays_like_merges_base_and_unknown_keys() -> None:
    base = {"sidewindDistanceAdjust": True}
    overrides = {"custom": "value"}
    result = remote.RemoteConfigStore._sanitize_plays_like(overrides, base)
    assert result["sidewindDistanceAdjust"] is True
    assert result["custom"] == "value"


@pytest.mark.parametrize(
    "payload",
    [
        "invalid",
        {"windModel": 123},
        {"sidewindDistanceAdjust": "true"},
        {"byClub": "bad"},
        {"byClub": {"driver": "bad"}},
        {"byClub": {"driver": {"scaleHead": "fast"}}},
    ],
)
def test_sanitize_plays_like_rejects_bad_payloads(payload) -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._sanitize_plays_like(payload)


def test_merge_tier_validates_current_and_overrides() -> None:
    current = {"playsLikeProfile": 123, "ui": {"playsLikeVariant": "v1"}}
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._merge_tier("tierA", current, None)

    overrides = {"playsLikeProfile": 123}
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._merge_tier("tierA", {}, overrides)


def test_merge_tier_applies_ui_and_profile_selection() -> None:
    current = {
        "playsLikeProfile": "literature_v1",
        "ui": {"playsLikeVariant": "off"},
    }
    overrides = {
        "playsLikeProfileSelection": {"playerType": "amateur"},
        "ui": {"playsLikeVariant": "v1"},
        "hudEnabled": True,
        "inputSize": 320,
    }
    result = remote.RemoteConfigStore._merge_tier("tierA", current, overrides)
    assert result["playsLikeProfileSelection"]["playerType"] == "amateur"
    assert result["ui"]["playsLikeVariant"] == "v1"
    assert result["hudEnabled"] is True


def test_merge_tier_validates_boolean_and_input_size() -> None:
    overrides = {"hudEnabled": "yes"}
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._merge_tier("tierA", {}, overrides)

    overrides = {"inputSize": "large"}
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._merge_tier("tierA", {}, overrides)


def test_validate_rejects_unexpected_tiers() -> None:
    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._validate({"tierX": {}}, remote.DEFAULT_REMOTE_CONFIG)

    with pytest.raises(remote.HTTPException):  # type: ignore[attr-defined]
        remote.RemoteConfigStore._validate({"tierA": []}, remote.DEFAULT_REMOTE_CONFIG)


def test_require_admin_accepts_matching_origin(monkeypatch):
    monkeypatch.setenv("ADMIN_TOKEN", "secret")
    request = SimpleNamespace(
        headers={"x-admin-token": "secret", "origin": "http://testserver"},
        url=SimpleNamespace(scheme="http", netloc="testserver"),
    )
    remote._require_admin(request)
