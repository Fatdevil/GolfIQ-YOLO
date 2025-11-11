from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.routes import runs_upload as runs_upload_module


def test_presign_v2_shape(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("RUNS_TTL_DAYS", "7")

    captured: dict[str, object] = {}

    def fake_presigned(key: str, ttl_days: int):
        captured["key"] = key
        captured["ttl"] = ttl_days
        return {
            "url": "https://s3.example.com/upload",
            "headers": {"Content-Type": "application/octet-stream"},
        }

    monkeypatch.setattr(runs_upload_module, "get_presigned_put", fake_presigned)

    with TestClient(app) as client:
        response = client.post(
            "/runs/upload-url",
            params={"version": "v2"},
            json={"runId": "r1"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["url"] == "https://s3.example.com/upload"
    assert isinstance(payload["fields"], dict)
    assert payload["fields"]["key"] == captured["key"]
    assert payload["fields"]["contentType"] == "application/octet-stream"
    assert captured["ttl"] == 7
