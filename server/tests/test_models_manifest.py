from pathlib import Path

import pytest
from fastapi import HTTPException

from server.routes import models


def test_manifest_path_uses_override(monkeypatch, tmp_path: Path):
    override = tmp_path / "manifest.json"
    override.write_text("{}", encoding="utf-8")
    monkeypatch.setenv("MODEL_MANIFEST_PATH", str(override))

    path = models._manifest_path()
    assert path == override


def test_manifest_path_defaults(monkeypatch):
    monkeypatch.delenv("MODEL_MANIFEST_PATH", raising=False)
    path = models._manifest_path()
    assert str(path).endswith("models/manifest.json")


def test_load_manifest_handles_missing(tmp_path: Path, monkeypatch):
    missing = tmp_path / "missing.json"
    with pytest.raises(HTTPException) as excinfo:
        models._load_manifest_bytes(missing)
    assert excinfo.value.status_code == 404


def test_load_manifest_validates_json(tmp_path: Path):
    manifest = tmp_path / "manifest.json"
    manifest.write_bytes(b"not-json")

    with pytest.raises(HTTPException) as excinfo:
        models._load_manifest_bytes(manifest)
    assert excinfo.value.status_code == 500
    assert "invalid" in excinfo.value.detail


def test_matches_if_none_match_recognizes_variants():
    etag = '"abc"'
    header = 'W/"abc", "def"'
    assert models._matches_if_none_match(header, etag) is True
    assert models._matches_if_none_match("", etag) is False
