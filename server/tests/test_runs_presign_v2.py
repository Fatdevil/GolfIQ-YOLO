from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_runs_upload_presign_v2(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("RUNS_TTL_DAYS", "5")
    monkeypatch.setenv("S3_BUCKET", "golfiq-test")

    captured: dict[str, object] = {}

    def fake_presigned(key: str, ttl_days: int):
        captured["key"] = key
        captured["ttl"] = ttl_days
        return {
            "url": "https://s3.example.com/upload",
            "headers": {"Content-Type": "application/zip"},
            "expiresAt": "2025-01-01T00:00:00Z",
        }

    from server.routes import runs_upload as runs_upload_module

    monkeypatch.setattr(runs_upload_module, "get_presigned_put", fake_presigned)

    with TestClient(app) as client:
        response = client.post(
            "/runs/upload-url?version=v2", json={"runId": "field-run"}
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "url": "https://s3.example.com/upload",
        "fields": {"key": captured["key"], "contentType": "application/zip"},
    }
    assert captured["ttl"] == 5
