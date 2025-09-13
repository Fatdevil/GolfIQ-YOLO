import zipfile
from io import BytesIO

import numpy as np
from fastapi.testclient import TestClient

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


def test_cv_upload_analyze_npy_zip():
    client = TestClient(app)
    frames = [np.zeros((64, 64, 3), dtype=np.uint8) for _ in range(10)]
    payload = {
        "fps": "120",
        "ref_len_m": "1.0",
        "ref_len_px": "100.0",
        "mode": "detector",
    }
    zip_buf = _zip_of_npy(frames)
    files = {"frames_zip": ("frames.zip", zip_buf.getvalue(), "application/zip")}
    r = client.post("/cv/analyze", data=payload, files=files)
    assert r.status_code == 200, r.text
    data = r.json()
    m = data["metrics"]
    # grova sanity checks (mock-detektor ger deterministisk rörelse)
    assert "ball_speed_mps" in m and m["carry_m"] >= 0
