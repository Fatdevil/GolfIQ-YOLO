from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.trip import store

client = TestClient(app)


def _clear_store() -> None:
    store._TRIPS.clear()  # type: ignore[attr-defined]


def test_create_fetch_and_update_trip_round():
    _clear_store()

    create_payload = {
        "courseName": "Pebble Beach",
        "courseId": "course_1",
        "teesName": "Blue",
        "holes": 9,
        "players": ["Alice", "Bob"],
    }

    response = client.post("/api/trip/rounds", json=create_payload)
    assert response.status_code == 200
    data = response.json()

    trip_id = data["id"]
    assert trip_id.startswith("trip_")
    assert data["holes"] == 9
    assert len(data["players"]) == 2

    fetch_response = client.get(f"/api/trip/rounds/{trip_id}")
    assert fetch_response.status_code == 200
    fetched = fetch_response.json()
    assert fetched["id"] == trip_id

    scores_payload = {
        "scores": [
            {"hole": 1, "player_id": "p1", "strokes": 5},
            {"hole": 1, "player_id": "p2", "strokes": 4},
        ]
    }
    update_response = client.post(
        f"/api/trip/rounds/{trip_id}/scores", json=scores_payload
    )
    assert update_response.status_code == 200

    overwrite_payload = {
        "scores": [
            {"hole": 1, "player_id": "p1", "strokes": 6},
            {"hole": 2, "player_id": "p1", "strokes": 3},
        ]
    }
    final_response = client.post(
        f"/api/trip/rounds/{trip_id}/scores", json=overwrite_payload
    )
    assert final_response.status_code == 200
    final_trip = final_response.json()
    score_map = {(s["hole"], s["player_id"]): s for s in final_trip["scores"]}

    assert score_map[(1, "p1")]["strokes"] == 6
    assert score_map[(1, "p2")]["strokes"] == 4
    assert score_map[(2, "p1")]["strokes"] == 3


def test_trip_round_validation_errors():
    _clear_store()

    no_players_payload = {
        "courseName": "Test Course",
        "holes": 9,
        "players": [" ", ""],
    }

    response = client.post("/api/trip/rounds", json=no_players_payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "no_players"

    invalid_holes_payload = {
        "courseName": "Test Course",
        "holes": 0,
        "players": ["Alice", "Bob"],
    }

    response = client.post("/api/trip/rounds", json=invalid_holes_payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "invalid_holes"
