from fastapi.testclient import TestClient

from server.app import app


def test_mock_analyze_contains_spin_placeholders(monkeypatch):
    monkeypatch.setenv("ENABLE_SPIN", "0")
    with TestClient(app) as client:
        response = client.post("/cv/mock/analyze", json={"frames": 6, "fps": 120.0})
    assert response.status_code == 200
    metrics = response.json()["metrics"]
    assert "metrics_version" in metrics
    assert metrics.get("spin_rpm") is None
    assert metrics.get("spin_axis_deg") is None
    assert metrics.get("club_path_deg") is None
