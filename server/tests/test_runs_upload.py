from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from fastapi import HTTPException
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


def test_resolve_path_rejects_directory_escape(tmp_path, monkeypatch):
    from server.routes import runs_upload as runs_upload_module

    monkeypatch.setenv("RUNS_UPLOAD_DIR", str(tmp_path))
    with pytest.raises(HTTPException) as excinfo:
        runs_upload_module._resolve_path("../escape.zip")
    assert excinfo.value.status_code == 400


def test_upload_run_rejects_non_fs_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("RUNS_UPLOAD_DIR", str(tmp_path))
    monkeypatch.setenv("STORAGE_BACKEND", "s3")

    with TestClient(app) as client:
        response = client.post(
            "/runs/upload",
            data={"key": "demo.zip"},
            files={"file": ("run.zip", b"zip-bytes", "application/zip")},
        )
        assert response.status_code == 400


def test_hud_run_share_flow(tmp_path, monkeypatch):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    events = [
        {"event": "hud.frame", "timestampMs": 1, "device": "Pixel 7", "data": {"fps": 60}},
        {"event": "hud.frame", "timestampMs": 2, "device": "Pixel 7", "data": {"fps": 58}},
    ]

    with TestClient(app) as client:
        response = client.post("/runs/hud", json=events)
        assert response.status_code == 200
        payload = response.json()
        run_id = payload["id"]
        assert payload["url"] == f"/runs/{run_id}"

        by_id = Path(tmp_path, "by_id", f"{run_id}.json")
        assert by_id.exists()
        stored = json.loads(by_id.read_text(encoding="utf-8"))
        assert stored == events

        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        jsonl_path = Path(tmp_path, "hud", f"{day}.jsonl")
        assert jsonl_path.exists()
        lines = [line for line in jsonl_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        entry = json.loads(lines[-1])
        assert entry["id"] == run_id
        assert entry["kind"] == "hud"
        assert entry["url"] == f"/runs/{run_id}"

        get_response = client.get(f"/runs/{run_id}")
        assert get_response.status_code == 200
        etag = get_response.headers.get("etag")
        assert etag
        assert get_response.json() == events

        cached = client.get(f"/runs/{run_id}", headers={"If-None-Match": etag})
        assert cached.status_code == 304


def test_round_run_invalid_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("RUNS_DATA_DIR", str(tmp_path))

    with TestClient(app) as client:
        response = client.post("/runs/round", json=["not", "an", "object"])
        assert response.status_code == 400
        detail = response.json().get("detail")
        assert "round run" in detail
