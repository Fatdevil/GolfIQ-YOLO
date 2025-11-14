from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_advise_endpoint_returns_club_and_reasoning() -> None:
    payload = {
        "runId": "run-123",
        "hole": 5,
        "shot": {"before_m": 150.0, "target_bearing_deg": 0.0, "lie": "fairway"},
        "env": {
            "wind_mps": 4.0,
            "wind_dir_deg": 270.0,
            "temp_c": 18.0,
            "elev_delta_m": 2.0,
        },
        "bag": {
            "carries_m": {
                "PW": 115.0,
                "9i": 125.0,
                "8i": 135.0,
                "7i": 145.0,
                "6i": 155.0,
                "5i": 165.0,
            }
        },
    }
    response = client.post("/api/caddie/advise", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {
        "playsLike_m",
        "club",
        "reasoning",
        "confidence",
        "silent",
        "silent_reason",
    }
    assert isinstance(data["playsLike_m"], (int, float))
    assert isinstance(data["club"], str) and data["club"]
    assert isinstance(data["reasoning"], list) and data["reasoning"]
    assert isinstance(data["confidence"], (int, float))
    assert data["silent"] is False
    assert data["silent_reason"] is None
