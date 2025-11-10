import asyncio
import os

import pytest
from fastapi import HTTPException

from server.routes import coach_profile


def test_sync_enabled_handles_none(monkeypatch):
    monkeypatch.setattr(os, "getenv", lambda *_, **__: None)
    assert coach_profile._sync_enabled() is False


def test_normalize_device_id_requires_value():
    with pytest.raises(HTTPException) as excinfo:
        coach_profile._normalize_device_id("   ")
    assert excinfo.value.status_code == 400


def test_get_coach_profile_sync_disabled(monkeypatch):
    monkeypatch.setenv("COACH_SYNC_ENABLED", "0")
    coach_profile.reset_store()

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(coach_profile.get_coach_profile("device-1"))
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "sync disabled"


def test_get_and_post_profile_flow(monkeypatch):
    monkeypatch.setenv("COACH_SYNC_ENABLED", "1")
    coach_profile.reset_store()

    payload = coach_profile.CoachProfileEnvelope(
        deviceId="dev-1", profile={"mode": "pro"}
    )
    result = asyncio.run(coach_profile.post_coach_profile(payload))
    assert result == {"ok": True}

    stored = asyncio.run(coach_profile.get_coach_profile("dev-1"))
    assert stored == payload.profile


def test_post_profile_rejects_when_disabled(monkeypatch):
    monkeypatch.setenv("COACH_SYNC_ENABLED", "0")
    coach_profile.reset_store()

    payload = coach_profile.CoachProfileEnvelope(deviceId="dev-2", profile={})
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(coach_profile.post_coach_profile(payload))
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "sync disabled"


def test_get_profile_missing(monkeypatch):
    monkeypatch.setenv("COACH_SYNC_ENABLED", "1")
    coach_profile.reset_store()

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(coach_profile.get_coach_profile("unknown"))
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "profile not found"
