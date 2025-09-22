from __future__ import annotations

import zipfile
from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient

from server.app import app


class _SpyDetector:
    instances: list["_SpyDetector"] = []

    def __init__(self, mock: bool = False, motion=None):
        self.mock = mock
        self.motion = motion
        self.run_calls: list = []
        _SpyDetector.instances.append(self)

    def run(self, frame):
        self.run_calls.append(frame)
        return []


class _NoopImpactDetector:
    def __init__(self, detector):
        self.detector = detector

    def run_with_boxes(self, frames, boxes):
        return []


def _zip_of_npy(frames: list[np.ndarray]) -> BytesIO:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for i, frame in enumerate(frames):
            frame_buf = BytesIO()
            np.save(frame_buf, frame, allow_pickle=False)
            z.writestr(f"{i:03d}.npy", frame_buf.getvalue())
    buf.seek(0)
    return buf


def test_cv_analyze_uses_real_detector_when_inference_enabled(monkeypatch):
    from server.routes import cv_analyze

    _SpyDetector.instances = []
    monkeypatch.setattr(cv_analyze, "YOLO_INFERENCE", True)
    monkeypatch.setattr("cv_engine.pipeline.analyze.YoloV8Detector", _SpyDetector)
    monkeypatch.setattr("cv_engine.pipeline.analyze.ImpactDetector", _NoopImpactDetector)

    frames = [np.zeros((4, 4, 3), dtype=np.uint8) for _ in range(3)]
    zip_buf = _zip_of_npy(frames)

    payload = {
        "fps": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
    }

    with TestClient(app) as client:
        files = {"frames_zip": ("frames.zip", zip_buf.getvalue(), "application/zip")}
        response = client.post("/cv/analyze", data=payload, files=files)

    assert response.status_code == 200, response.text
    assert _SpyDetector.instances, "detector should have been instantiated"
    # When YOLO inference is enabled the API should not force mock mode.
    assert _SpyDetector.instances[0].mock is False


def test_cv_analyze_video_uses_real_detector_when_inference_enabled(monkeypatch):
    from server.routes import cv_analyze_video

    _SpyDetector.instances = []
    monkeypatch.setattr(cv_analyze_video, "YOLO_INFERENCE", True)
    monkeypatch.setattr("cv_engine.pipeline.analyze.YoloV8Detector", _SpyDetector)
    monkeypatch.setattr("cv_engine.pipeline.analyze.ImpactDetector", _NoopImpactDetector)

    monkeypatch.setattr(
        "server.routes.cv_analyze_video.frames_from_video",
        lambda data, max_frames=300, stride=1: [
            np.zeros((4, 4, 3), dtype=np.uint8) for _ in range(3)
        ],
    )
    monkeypatch.setattr(
        "server.routes.cv_analyze_video.fps_from_video", lambda data: 120.0
    )

    form_data = {
        "fps_fallback": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
    }

    with TestClient(app) as client:
        files = {"video": ("test.mp4", b"00", "video/mp4")}
        response = client.post("/cv/analyze/video", data=form_data, files=files)

    assert response.status_code == 200, response.text
    assert _SpyDetector.instances, "detector should have been instantiated"
    assert _SpyDetector.instances[-1].mock is False
