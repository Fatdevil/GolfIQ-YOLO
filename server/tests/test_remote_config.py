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


def test_update_remote_config_validates_profile_selection(monkeypatch: pytest.MonkeyPatch):
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
                "tierB": {
                    "playsLike": {"byClub": {"driver": {"scaleHead": "fast"}}}
                }
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
