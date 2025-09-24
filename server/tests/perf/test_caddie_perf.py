import json
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from server import app as fastapi_app


@pytest.mark.skip(reason="Perf harness for manual runs; not part of CI gating")
def test_caddie_recommend_p95_manual():
    client = TestClient(fastapi_app.app)
    payload = json.loads(
        Path(
            "specs/001-feature-caddiecore-v1/contracts/examples/range_request.json"
        ).read_text()
    )
    samples = []
    for _ in range(50):
        t0 = time.perf_counter()
        r = client.post("/caddie/recommend", json=payload)
        assert r.status_code == 200
        samples.append((time.perf_counter() - t0) * 1000)
    samples.sort()
    p95 = samples[int(0.95 * len(samples)) - 1]
    print(f"P95(ms)={p95:.2f}")
