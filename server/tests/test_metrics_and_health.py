from fastapi.testclient import TestClient

from server.app import app


def test_health_has_build_info(monkeypatch):
    monkeypatch.setenv("BUILD_VERSION", "vTEST")
    monkeypatch.setenv("GIT_SHA", "abc1234")
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "ok"
        assert data.get("version") in {"vTEST", "dev"}
        assert data.get("git") in {"abc1234", "unknown"}


def test_metrics_endpoint_exposes_counters():
    with TestClient(app) as client:
        client.get("/health")
        response = client.get("/metrics")
        assert response.status_code == 200
        body = response.text
        assert "requests_total" in body
        assert "request_latency_seconds" in body
