from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_caddie_health_empty_ok() -> None:
    client = TestClient(app)
    response = client.get("/caddie/health")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "since" in data
