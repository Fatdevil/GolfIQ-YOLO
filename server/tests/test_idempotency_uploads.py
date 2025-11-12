from __future__ import annotations

from typing import Dict

import pytest
from fastapi.testclient import TestClient

from server.api.routers import uploads as uploads_module
from server.app import app


@pytest.fixture(autouse=True)
def reset_state():
    uploads_module._reset_state()
    yield
    uploads_module._reset_state()


def _client() -> TestClient:
    return TestClient(app)


def test_presign_idempotent(monkeypatch):
    captured: Dict[str, Dict[str, str]] = {}

    def fake_presign(key: str, ttl_days: int):
        captured[key] = {"url": f"https://uploads.example/{key}", "expiresAt": 1234}
        return {"url": f"https://uploads.example/{key}", "expiresAt": 1234}

    monkeypatch.setattr(uploads_module, "get_presigned_put", fake_presign)

    client = _client()
    headers = {"Idempotency-Key": "clip-presign-1"}
    first = client.post("/api/uploads/presign", headers=headers)
    second = client.post("/api/uploads/presign", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
    assert len(captured) == 1


def test_finalize_idempotent_returns_same_clip(monkeypatch):
    client = _client()
    payload = {"dedupeKey": "clip-123", "clipMeta": {"objectKey": "foo/bar"}}

    first = client.post("/api/uploads/finalize", json=payload)
    second = client.post("/api/uploads/finalize", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()
