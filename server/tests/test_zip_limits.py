import zipfile
from io import BytesIO

from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_analyze


def _zip_with_files(count: int, *, filename: str | None = None, payload: bytes | None = None) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for i in range(count):
            name = filename or f"{i:03d}.npy"
            data = payload if payload is not None else b"0" * 10
            zf.writestr(name, data)
    buf.seek(0)
    return buf.getvalue()


def test_zip_file_count_limit(monkeypatch):
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_FILES", 1)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_RATIO", 10_000)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_SIZE_BYTES", 1_000_000)
    data = _zip_with_files(2)
    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", data, "application/zip")}
        response = client.post("/cv/analyze", data={}, files=files)
    assert response.status_code == 413


def test_zip_ratio_limit(monkeypatch):
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_FILES", 10)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_RATIO", 2)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_SIZE_BYTES", 1_000_000)
    data = _zip_with_files(1, payload=b"0" * 10_000)
    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", data, "application/zip")}
        response = client.post("/cv/analyze", data={}, files=files)
    assert response.status_code == 413


def test_zip_invalid_extension(monkeypatch):
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_FILES", 10)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_RATIO", 10_000)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_SIZE_BYTES", 1_000_000)
    data = _zip_with_files(1, filename="bad.txt", payload=b"oops")
    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", data, "application/zip")}
        response = client.post("/cv/analyze", data={}, files=files)
    assert response.status_code == 400


def test_zip_rejects_large_member(monkeypatch):
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_FILES", 10)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_RATIO", 10_000)
    monkeypatch.setattr(cv_analyze, "MAX_ZIP_SIZE_BYTES", 100)
    data = _zip_with_files(1, payload=b"0" * 200)
    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", data, "application/zip")}
        response = client.post("/cv/analyze", data={}, files=files)
    assert response.status_code == 413
