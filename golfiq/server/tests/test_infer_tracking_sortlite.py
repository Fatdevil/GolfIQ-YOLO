from server.api.main import app
from fastapi.testclient import TestClient

def test_infer_detections_sortlite():
    client = TestClient(app)
    payload = {
        "mode": "detections",
        "detections": [
            {"t": -0.02, "dets": [
                {"cls":"club_head","conf":0.9,"x1":390,"y1":590,"x2":410,"y2":610},
                {"cls":"ball","conf":0.9,"x1":500,"y1":600,"x2":502,"y2":602}
            ]},
            {"t": -0.01, "dets": [
                {"cls":"club_head","conf":0.9,"x1":440,"y1":560,"x2":460,"y2":580},
                {"cls":"ball","conf":0.9,"x1":500,"y1":600,"x2":502,"y2":602}
            ]},
            {"t": 0.00, "dets": [
                {"cls":"club_head","conf":0.9,"x1":500,"y1":600,"x2":520,"y2":620},
                {"cls":"ball","conf":0.9,"x1":500,"y1":600,"x2":502,"y2":602}
            ]},
            {"t": 0.01, "dets": [
                {"cls":"club_head","conf":0.9,"x1":530,"y1":610,"x2":550,"y2":630},
                {"cls":"ball","conf":0.9,"x1":515,"y1":590,"x2":517,"y2":592}
            ]},
            {"t": 0.02, "dets": [
                {"cls":"club_head","conf":0.9,"x1":560,"y1":620,"x2":580,"y2":640},
                {"cls":"ball","conf":0.9,"x1":530,"y1":580,"x2":532,"y2":582}
            ]}
        ],
        "meta": {"fps": 120, "scale_m_per_px": 0.002, "calibrated": True, "view": "DTL"},
        "tracking": {"mode":"sortlite", "iou_thr": 0.1}
    }
    r = client.post("/infer", json=payload)
    assert r.status_code == 200
    m = r.json()["metrics"]
    assert m["club_speed_mps"] > 0 and m["ball_speed_mps"] > 0
