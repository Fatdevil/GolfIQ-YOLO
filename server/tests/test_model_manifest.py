from __future__ import annotations

import hashlib
import importlib
import json
from pathlib import Path
from typing import Tuple

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _build_manifest_payload() -> dict:
    return {
        "version": 1,
        "android": [
            {
                "id": "yolox-nano-int8-320",
                "url": "https://cdn.example.com/android/yolox-nano-int8-320.tflite",
                "sha256": "9" * 64,
                "size": 123,
                "runtime": "tflite",
                "inputSize": 320,
                "quant": "int8",
            }
        ],
        "ios": [
            {
                "id": "yolox-s-fp16-384",
                "url": "https://cdn.example.com/ios/yolox-s-fp16-384.mlmodelc",
                "sha256": "8" * 64,
                "size": 456,
                "runtime": "coreml",
                "inputSize": 384,
                "quant": "fp16",
            }
        ],
    }


def _make_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Tuple[TestClient, Path, dict]:
    manifest_payload = _build_manifest_payload()
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(json.dumps(manifest_payload), encoding="utf-8")

    monkeypatch.setenv("MODEL_MANIFEST_PATH", str(manifest_path))

    from server.routes import models as models_module

    importlib.reload(models_module)

    app = FastAPI()
    app.include_router(models_module.router)
    client = TestClient(app)
    return client, manifest_path, manifest_payload


def test_manifest_endpoint_returns_payload_with_etag(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, manifest_path, manifest_payload = _make_client(tmp_path, monkeypatch)

    response = client.get("/models/manifest.json")
    assert response.status_code == 200
    assert response.json() == manifest_payload

    expected_digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    assert response.headers["etag"] == f'"{expected_digest}"'
    assert response.headers["cache-control"] == "public, max-age=3600"


def test_manifest_endpoint_supports_conditional_requests(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, manifest_path, _ = _make_client(tmp_path, monkeypatch)

    first = client.get("/models/manifest.json")
    assert first.status_code == 200
    etag = first.headers["etag"]

    second = client.get(
        "/models/manifest.json",
        headers={"If-None-Match": etag},
    )
    assert second.status_code == 304
    assert second.content == b""
    assert second.headers["etag"] == etag

    mismatch = client.get(
        "/models/manifest.json",
        headers={"If-None-Match": '"deadbeef"'},
    )
    assert mismatch.status_code == 200
    digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    assert mismatch.headers["etag"] == f'"{digest}"'
