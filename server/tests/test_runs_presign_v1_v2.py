from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.routes import runs_upload as runs_upload_module


client = TestClient(app)


def test_v2_shape(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("RUNS_TTL_DAYS", "7")

    captured: dict[str, object] = {}

    def fake_presign(key: str, ttl_days: int):
        captured["key"] = key
        captured["ttl"] = ttl_days
        return {
            "url": "https://s3.example.com/upload",
            "headers": {"Content-Type": "application/octet-stream"},
            "policy": "demo-policy",
        }

    monkeypatch.setattr(runs_upload_module, "get_presigned_put", fake_presign)

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
    assert payload["fields"]["policy"] == "demo-policy"
    assert captured["ttl"] == 7


def test_v1_shape_default(monkeypatch) -> None:
    monkeypatch.delenv("STORAGE_BACKEND", raising=False)
    response = client.post(
        "/runs/upload-url",
        json={"runId": "r2"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert any(key in payload for key in ("formUrl", "fields", "backend"))


def test_invalid_version_defaults_to_v1(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("RUNS_TTL_DAYS", "5")

    def fake_presign(key: str, ttl_days: int):
        return {"url": "https://s3.example.com/upload", "headers": {}}

    monkeypatch.setattr(runs_upload_module, "get_presigned_put", fake_presign)

    response = client.post(
        "/runs/upload-url",
        params={"version": "v3"},
        json={"runId": "r3"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["backend"] == "s3"
    assert "fields" not in payload
