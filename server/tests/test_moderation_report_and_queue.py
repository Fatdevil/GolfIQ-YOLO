from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import moderation as mod

client = TestClient(app, raise_server_exceptions=False)


def test_report_creates_queue_item(monkeypatch):
    captured: dict[str, object] = {}

    def fake_record_report(clip_id: str, *, reason: str, details=None, reporter=None):
        captured["clip_id"] = clip_id
        captured["reason"] = reason
        return {
            "id": "rep1",
            "clipId": clip_id,
            "ts": 1731200000,
            "reason": reason,
            "status": "open",
        }

    monkeypatch.setattr(
        mod.moderation_repo, "record_report", fake_record_report, raising=True
    )

    response = client.post("/clips/clip123/report", json={"reason": "abuse"})
    assert response.status_code in (200, 201)
    assert captured["clip_id"] == "clip123"
    assert "abuse" in response.text


def test_queue_requires_admin_and_lists(monkeypatch):
    app.dependency_overrides[mod.require_admin] = lambda: {"memberId": "host1"}

    def fake_list_queue(status: str = "open"):
        return [
            {
                "clipId": "c1",
                "hidden": False,
                "visibility": "public",
                "reports": 1,
                "updatedTs": 1731200000,
            },
            {
                "clipId": "c2",
                "hidden": True,
                "visibility": "public",
                "reports": 2,
                "updatedTs": 1731200001,
            },
        ]

    monkeypatch.setattr(
        mod.moderation_repo, "list_queue", fake_list_queue, raising=True
    )
    try:
        response = client.get("/admin/moderation/queue")
        payload = response.json()
        assert response.status_code == 200
        assert isinstance(payload, list) and len(payload) == 2
    finally:
        app.dependency_overrides.pop(mod.require_admin, None)


def test_queue_unauthorized_without_admin():
    response = client.get("/admin/moderation/queue")
    assert response.status_code in (401, 403)


def test_rate_limit_blocks_after_threshold():
    mod.reset_rate_limiter()
    ip_address = "10.0.0.1"
    for _ in range(mod._RATE_LIMIT_MAX):
        mod._enforce_rate_limit(ip_address)
    with pytest.raises(mod.HTTPException) as excinfo:
        mod._enforce_rate_limit(ip_address)
    assert excinfo.value.status_code == mod.status.HTTP_429_TOO_MANY_REQUESTS
    mod.reset_rate_limiter()


def test_rate_limit_evicts_expired_entries(monkeypatch):
    mod.reset_rate_limiter()
    ip_address = "10.0.0.2"
    bucket = mod._RATE_LIMIT_BUCKETS[ip_address]
    bucket.append(0.0)

    monkeypatch.setattr(
        mod.time, "time", lambda: mod._RATE_LIMIT_WINDOW + 1.0, raising=False
    )
    mod._enforce_rate_limit(ip_address)

    assert len(bucket) == 1
    mod.reset_rate_limiter()
