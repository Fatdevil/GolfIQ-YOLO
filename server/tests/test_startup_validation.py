from __future__ import annotations

import os

import pytest

from server.startup_validation import validate_startup


def test_require_api_key_enforced(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.delenv("API_KEY", raising=False)
    with pytest.raises(RuntimeError):
        validate_startup()

    monkeypatch.setenv("API_KEY", "set")
    validate_startup()


def test_admin_and_live_secrets_required_in_strict_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("LIVE_SIGN_SECRET", raising=False)
    monkeypatch.delenv("LIVE_VIEWER_SIGN_KEY", raising=False)

    with pytest.raises(RuntimeError) as excinfo:
        validate_startup()
    message = str(excinfo.value)
    assert "ADMIN_TOKEN" in message
    assert "LIVE_SIGN_SECRET" in message
    assert "LIVE_VIEWER_SIGN_KEY" in message

    monkeypatch.setenv("ADMIN_TOKEN", "admin")
    monkeypatch.setenv("LIVE_SIGN_SECRET", "secret")
    monkeypatch.setenv("LIVE_VIEWER_SIGN_KEY", "viewer-key")
    validate_startup()


def test_dev_env_skips_strict_checks(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("STAGING", raising=False)
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("LIVE_SIGN_SECRET", raising=False)
    monkeypatch.delenv("LIVE_VIEWER_SIGN_KEY", raising=False)

    validate_startup()
