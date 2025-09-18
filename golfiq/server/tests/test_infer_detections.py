from fastapi.testclient import TestClient

from ..api.main import app


def test_infer_with_detections():
    payload = {
        "mode": "detections",
        "detections": [
            {
                "t": -0.02,
                "dets": [
                    {
                        "cls": "club_head",
                        "conf": 0.9,
                        "x1": 100,
                        "y1": 500,
                        "x2": 120,
                        "y2": 520,
                    },
                    {
                        "cls": "ball",
                        "conf": 0.95,
                        "x1": 300,
                        "y1": 520,
                        "x2": 310,
                        "y2": 530,
                    },
                ],
            },
            {
                "t": -0.01,
                "dets": [
                    {
                        "cls": "club_head",
                        "conf": 0.9,
                        "x1": 120,
                        "y1": 498,
                        "x2": 140,
                        "y2": 518,
                    },
                    {
                        "cls": "ball",
                        "conf": 0.95,
                        "x1": 300,
                        "y1": 520,
                        "x2": 310,
                        "y2": 530,
                    },
                ],
            },
            {
                "t": 0.0,
                "dets": [
                    {
                        "cls": "club_head",
                        "conf": 0.9,
                        "x1": 150,
                        "y1": 490,
                        "x2": 170,
                        "y2": 510,
                    },
                    {
                        "cls": "ball",
                        "conf": 0.95,
                        "x1": 300,
                        "y1": 520,
                        "x2": 310,
                        "y2": 530,
                    },
                ],
            },
            {
                "t": 0.01,
                "dets": [
                    {
                        "cls": "club_head",
                        "conf": 0.9,
                        "x1": 300,
                        "y1": 520,
                        "x2": 320,
                        "y2": 540,
                    },
                    {
                        "cls": "ball",
                        "conf": 0.95,
                        "x1": 300,
                        "y1": 520,
                        "x2": 310,
                        "y2": 530,
                    },
                ],
            },
            {
                "t": 0.02,
                "dets": [
                    {
                        "cls": "club_head",
                        "conf": 0.9,
                        "x1": 320,
                        "y1": 522,
                        "x2": 340,
                        "y2": 542,
                    },
                    {
                        "cls": "ball",
                        "conf": 0.95,
                        "x1": 315,
                        "y1": 508,
                        "x2": 325,
                        "y2": 518,
                    },
                ],
            },
            {
                "t": 0.03,
                "dets": [
                    {
                        "cls": "club_head",
                        "conf": 0.9,
                        "x1": 340,
                        "y1": 524,
                        "x2": 360,
                        "y2": 544,
                    },
                    {
                        "cls": "ball",
                        "conf": 0.95,
                        "x1": 335,
                        "y1": 492,
                        "x2": 345,
                        "y2": 502,
                    },
                ],
            },
        ],
        "meta": {
            "fps": 120.0,
            "scale_m_per_px": 0.002,
            "view": "DTL",
            "calibrated": True,
        },
    }
    with TestClient(app) as client:
        r = client.post("/infer", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert data["quality"] in ["green", "yellow", "red"]
    m = data["metrics"]
    for k in ["club_speed_mps", "ball_speed_mps", "launch_deg", "carry_m"]:
        assert k in m
        assert isinstance(m[k], (int, float))
