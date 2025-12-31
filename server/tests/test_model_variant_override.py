import zipfile
from io import BytesIO

import numpy as np
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


def test_cv_analyze_respects_model_variant_header(monkeypatch):
    captured = {}

    def _fake_analyze_frames(
        frames,
        calib,
        *,
        mock,
        smoothing_window,
        model_variant=None,
        variant_source=None,
        **__,
    ):
        captured["model_variant"] = model_variant
        captured["variant_source"] = variant_source
        return {"events": [1], "metrics": {"confidence": 0.5}}

    monkeypatch.setattr(routes.cv_analyze, "analyze_frames", _fake_analyze_frames)

    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(3)]
    payload = {
        "fps": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "mode": "detector",
    }
    zip_buf = _zip_of_npy(frames)
    files = {"frames_zip": ("frames.zip", zip_buf.getvalue(), "application/zip")}

    with TestClient(app) as client:
        response = client.post(
            "/cv/analyze",
            data=payload,
            files=files,
            headers={"x-model-variant": "yolov11"},
        )

    assert response.status_code == 200, response.text
    assert captured["model_variant"] == "yolov11"
    assert captured["variant_source"] == "X-Model-Variant"


def test_cv_analyze_video_respects_model_variant(monkeypatch):
    captured = {}

    def _fake_analyze_frames(
        frames,
        calib,
        *,
        mock,
        smoothing_window,
        model_variant=None,
        variant_source=None,
        **__,
    ):
        captured["model_variant"] = model_variant
        captured["variant_source"] = variant_source
        return {"events": [1], "metrics": {"confidence": 0.5}}

    monkeypatch.setattr(routes.cv_analyze_video, "analyze_frames", _fake_analyze_frames)
    monkeypatch.setattr(
        routes.cv_analyze_video,
        "frames_from_video",
        lambda data, **__: [object(), object()],
    )
    monkeypatch.setattr(routes.cv_analyze_video, "fps_from_video", lambda data: 120.0)

    files = {"video": ("swing.mp4", b"fake-bytes", "video/mp4")}
    data = {
        "fps_fallback": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "smoothing_window": "3",
    }

    with TestClient(app) as client:
        response = client.post(
            "/cv/analyze/video",
            data=data,
            files=files,
            headers={"x-model-variant": "yolov10"},
        )

    assert response.status_code == 200, response.text
    assert captured["model_variant"] == "yolov10"
    assert captured["variant_source"] == "X-Model-Variant"
