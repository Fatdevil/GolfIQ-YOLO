from io import BytesIO
import zipfile

from fastapi.testclient import TestClient

from server.app import app
from server.routes import cv_analyze


def _zip_with_files(count: int) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for i in range(count):
            zf.writestr(f"{i:03d}.npy", b"0" * 10)
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
