from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.routes import issues as issues_module


@pytest.fixture()
def issues_env(tmp_path, monkeypatch):
    monkeypatch.setenv("ISSUES_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "test-key")
    yield tmp_path
    monkeypatch.delenv("ISSUES_DATA_DIR", raising=False)
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)


def test_create_and_fetch_issue(issues_env: Path):
    with TestClient(app) as client:
        payload = {"queue": {"pending": 1}, "events": [{"type": "uploader:failure"}]}
        response = client.post(
            "/issues",
            json=payload,
            headers={"x-api-key": "test-key"},
        )
        assert response.status_code == 201
        issue_id = response.json().get("id")
        assert issue_id

        stored_files = list(Path(issues_env).glob("*.jsonl"))
        assert stored_files
        contents = stored_files[0].read_text(encoding="utf-8").strip().splitlines()
        assert contents

        fetched = client.get(f"/issues/{issue_id}", headers={"x-api-key": "test-key"})
        assert fetched.status_code == 200
        record = fetched.json()
        assert record["issue_id"] == issue_id
        assert record["payload"] == payload


def test_issue_lookup_missing_returns_404(issues_env: Path):
    with TestClient(app) as client:
        missing = client.get("/issues/unknown", headers={"x-api-key": "test-key"})
        assert missing.status_code == 404


def test_load_issue_tolerates_corruption(issues_env: Path):
    day_file = issues_env / "2025-01-01.jsonl"
    day_file.write_text(
        "\n".join(
            [
                "",  # blank line should be skipped
                "not-json",  # invalid JSON should be ignored
                '{"issue_id": "other"}',
                '{"issue_id": "target", "payload": {}}',
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    record = issues_module._load_issue("target")
    assert record and record["issue_id"] == "target"


def test_load_issue_handles_disappearing_file(issues_env: Path, monkeypatch):
    phantom = issues_env / "2025-01-02.jsonl"
    phantom.write_text('{"issue_id": "ghost"}\n', encoding="utf-8")

    real_open = Path.open

    def flaky_open(self: Path, *args, **kwargs):
        if self.name == "2025-01-02.jsonl":
            raise FileNotFoundError
        return real_open(self, *args, **kwargs)

    monkeypatch.setattr(Path, "open", flaky_open)

    assert issues_module._load_issue("ghost") is None


def test_load_issue_handles_missing_directory(tmp_path: Path, monkeypatch):
    missing_root = tmp_path / "missing"
    monkeypatch.setattr(issues_module, "_issues_root", lambda: missing_root)

    assert issues_module._load_issue("anything") is None
