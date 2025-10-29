from __future__ import annotations

from typing import Dict

from fastapi.testclient import TestClient

from server.app import app
from server.routes import coach_profile

client = TestClient(app)


def setup_function() -> None:
    coach_profile.reset_store()


def test_post_and_get_profile(monkeypatch) -> None:
    monkeypatch.setenv("COACH_SYNC_ENABLED", "1")
    payload: Dict[str, object] = {
        "deviceId": "device-123",
        "profile": {
            "id": "device-123",
            "version": "1.0",
            "focusWeights": {"putt": 0.3},
        },
    }
    response = client.post("/coach/profile", json=payload)
    assert response.status_code == 200
    response = client.get("/coach/profile", params={"deviceId": "device-123"})
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "device-123"


def test_get_disabled_returns_404(monkeypatch) -> None:
    monkeypatch.delenv("COACH_SYNC_ENABLED", raising=False)
    response = client.get("/coach/profile", params={"deviceId": "device-123"})
    assert response.status_code == 404
