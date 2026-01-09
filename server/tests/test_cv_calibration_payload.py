import json
import zipfile
from io import BytesIO

import numpy as np
import pytest
from fastapi.testclient import TestClient

from server import routes
from server.app import app


def _zip_of_npy(frames):
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for i, f in enumerate(frames):
            b = BytesIO()
            np.save(b, f, allow_pickle=False)
            z.writestr(f"{i:03d}.npy", b.getvalue())
    buf.seek(0)
    return buf


def _post_cv_analyze(client: TestClient, calibration_payload: dict | None):
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(10)]
    payload = {
        "fps": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "mode": "detector",
        "mock": "true",
    }
    if calibration_payload is not None:
        payload["calibration"] = json.dumps(calibration_payload)
    zip_buf = _zip_of_npy(frames)
    files = {"frames_zip": ("frames.zip", zip_buf.getvalue(), "application/zip")}
    return client.post("/cv/analyze", data=payload, files=files)


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def patched_video_dependencies(monkeypatch):
    module = routes.cv_analyze_video
    frames = [object(), object(), object()]

    def _fake_frames_from_video(data, max_frames=300, stride=1):
        return list(frames)

    monkeypatch.setattr(module, "frames_from_video", _fake_frames_from_video)
    monkeypatch.setattr(module, "fps_from_video", lambda data: 120.0)
    return module


def _post_video_request(client: TestClient, calibration_payload: dict | None):
    files = {"video": ("swing.mp4", b"fake-bytes", "video/mp4")}
    data = {
        "fps_fallback": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "smoothing_window": "3",
        "mock": "true",
    }
    if calibration_payload is not None:
        data["calibration"] = json.dumps(calibration_payload)
    return client.post("/cv/analyze/video", data=data, files=files)


def test_cv_analyze_rejects_invalid_calibration_number(client):
    response = _post_cv_analyze(
        client,
        {
            "enabled": True,
            "metersPerPixel": "abc",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["error"] == "invalid_calibration_payload"


def test_cv_analyze_allows_empty_string_calibration(client):
    response = _post_cv_analyze(
        client,
        {
            "enabled": True,
            "metersPerPixel": "",
        },
    )

    assert response.status_code == 200


def test_cv_analyze_accepts_numeric_string_calibration(client):
    response = _post_cv_analyze(
        client,
        {
            "enabled": True,
            "metersPerPixel": "0.01",
            "cameraFps": "120",
        },
    )

    assert response.status_code == 200


def test_cv_analyze_video_rejects_invalid_calibration_number(
    client, patched_video_dependencies
):
    response = _post_video_request(
        client,
        {
            "enabled": True,
            "metersPerPixel": "abc",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["error"] == "invalid_calibration_payload"
