import os
import tempfile

import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")


def _mp4_bytes(frames=10, w=64, h=64):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    writer = cv2.VideoWriter(path, fourcc, 30.0, (w, h))
    for i in range(frames):
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (i % 255, 0, 0)
        writer.write(img[:, :, ::-1])
    writer.release()
    with open(path, "rb") as f:
        data = f.read()
    os.remove(path)
    return data


def test_cv_analyze_video_endpoint():
    from fastapi.testclient import TestClient

    from server.app import app

    client = TestClient(app)

    video_bytes = _mp4_bytes(frames=12)
    files = {"video": ("test.mp4", video_bytes, "video/mp4")}
    data = {
        "fps_fallback": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "smoothing_window": "3",
    }
    r = client.post("/cv/analyze/video", data=data, files=files)
    assert r.status_code == 200, r.text
    m = r.json()["metrics"]
    assert 0.0 <= m["confidence"] <= 1.0
