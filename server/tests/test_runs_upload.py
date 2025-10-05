from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from server.app import app


def test_runs_upload_url_fs(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "fs")
    monkeypatch.setenv("RUNS_UPLOAD_DIR", str(tmp_path))

    with TestClient(app) as client:
        response = client.post("/runs/upload-url", json={"runId": "field-run"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["backend"] == "fs"
        assert payload["formUrl"] == "/runs/upload"
        key = payload["key"]
        assert key.endswith(".zip")

        upload_response = client.post(
            "/runs/upload",
            data={"key": key},
            files={"file": ("run.zip", b"zip-bytes", "application/zip")},
        )
        assert upload_response.status_code == 200

    stored = Path(tmp_path, key)
    assert stored.exists()
    assert stored.read_bytes() == b"zip-bytes"


def test_runs_upload_url_s3(monkeypatch):
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("RUNS_TTL_DAYS", "5")
    monkeypatch.setenv("S3_BUCKET", "golfiq-test")

    captured = {}

    def fake_presigned(key: str, ttl_days: int):
        captured["key"] = key
        captured["ttl"] = ttl_days
        return {
            "url": "http://example.com/upload",
            "headers": {"x-test": "1"},
            "expiresAt": "2025-01-01T00:00:00Z",
        }

    from server.routes import runs_upload as runs_upload_module

    monkeypatch.setattr(runs_upload_module, "get_presigned_put", fake_presigned)

    with TestClient(app) as client:
        response = client.post("/runs/upload-url", json={"runId": "field-run"})
        assert response.status_code == 200
        payload = response.json()
        assert payload["backend"] == "s3"
        assert payload["url"] == "http://example.com/upload"
        assert payload["ttl"] == 5
        assert payload["headers"] == {"x-test": "1"}
        assert payload["expiresAt"] == "2025-01-01T00:00:00Z"
        assert payload["key"].startswith("field-run/")

    assert captured["ttl"] == 5
    assert captured["key"].startswith("field-run/")
