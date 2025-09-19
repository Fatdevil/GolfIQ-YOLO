from fastapi.testclient import TestClient

from server.api.routers import metrics as metrics_module
from server.app import app


def test_metrics_faceon_route_invokes_compute(monkeypatch):
    called = {}

    def _fake_compute(detections, *, frame_w, frame_h, mm_per_px=None):
        called["args"] = (detections, frame_w, frame_h, mm_per_px)
        return {"ok": True}

    monkeypatch.setattr(metrics_module, "compute_faceon_metrics", _fake_compute)

    payload = {
        "frame_w": 640,
        "frame_h": 480,
        "detections": [{"label": "ball"}],
        "mm_per_px": 0.5,
    }

    with TestClient(app) as client:
        response = client.post("/metrics/faceon", json=payload)

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert called["args"] == ([{"label": "ball"}], 640, 480, 0.5)
