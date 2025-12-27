from __future__ import annotations

from fastapi.testclient import TestClient

from server.api import ready as ready_api
from server.app import app
from server.readiness import readiness_checks


def _set_dirs(monkeypatch, tmp_path):
    monkeypatch.setenv("RUNS_UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("GOLFIQ_RUNS_DIR", str(tmp_path / "runs"))
    monkeypatch.setenv("GOLFIQ_ROUNDS_DIR", str(tmp_path / "rounds"))
    monkeypatch.setenv("GOLFIQ_BAGS_DIR", str(tmp_path / "bags"))
    monkeypatch.setenv(
        "FEATURE_FLAGS_CONFIG_PATH", str(tmp_path / "feature_flags.json")
    )


def test_readiness_ok(monkeypatch, tmp_path):
    _set_dirs(monkeypatch, tmp_path)
    monkeypatch.setenv("STORAGE_BACKEND", "fs")

    result = readiness_checks()
    assert result["status"] == "ok"
    check_statuses = {c["name"]: c["status"] for c in result["checks"]}
    assert all(status == "ok" for status in check_statuses.values())


def test_readiness_presign_failure(monkeypatch, tmp_path):
    _set_dirs(monkeypatch, tmp_path)
    monkeypatch.setenv("STORAGE_BACKEND", "s3")
    monkeypatch.setenv("S3_BUCKET", "unit-bucket")

    def _boom(*_args, **_kwargs):
        raise RuntimeError("nope")

    monkeypatch.setattr("server.readiness.get_presigned_put", _boom)

    result = readiness_checks()
    presign = next(
        check for check in result["checks"] if check["name"] == "storage:presign"
    )
    assert presign["status"] == "error"
    assert result["status"] == "error"


def test_ready_endpoint_status(monkeypatch):
    client = TestClient(app)

    monkeypatch.setattr(
        ready_api, "readiness_checks", lambda: {"status": "ok", "checks": []}
    )
    ok = client.get("/ready")
    assert ok.status_code == 200

    monkeypatch.setattr(
        ready_api, "readiness_checks", lambda: {"status": "error", "checks": []}
    )
    fail = client.get("/ready")
    assert fail.status_code == 503
