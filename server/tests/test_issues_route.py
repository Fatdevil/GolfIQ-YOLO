from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import app


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

        fetched = client.get(
            f"/issues/{issue_id}", headers={"x-api-key": "test-key"}
        )
        assert fetched.status_code == 200
        record = fetched.json()
        assert record["issue_id"] == issue_id
        assert record["payload"] == payload


def test_issue_lookup_missing_returns_404(issues_env: Path):
    with TestClient(app) as client:
        missing = client.get(
            "/issues/unknown", headers={"x-api-key": "test-key"}
        )
        assert missing.status_code == 404
