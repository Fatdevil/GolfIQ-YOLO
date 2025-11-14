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


def test_upsert_scores_rejects_invalid_entries():
    _clear_store()

    create_payload = {
        "courseName": "Augusta National",
        "holes": 3,
        "players": ["Ann", "Ben"],
    }

    response = client.post("/api/trip/rounds", json=create_payload)
    assert response.status_code == 200
    trip_id = response.json()["id"]

    invalid_hole_payload = {
        "scores": [
            {"hole": 4, "player_id": "p1", "strokes": 5},
        ]
    }

    invalid_hole_response = client.post(
        f"/api/trip/rounds/{trip_id}/scores", json=invalid_hole_payload
    )
    assert invalid_hole_response.status_code == 400
    assert invalid_hole_response.json()["detail"] == "invalid_score_entries"

    fetch_after_invalid = client.get(f"/api/trip/rounds/{trip_id}")
    assert fetch_after_invalid.status_code == 200
    assert fetch_after_invalid.json()["scores"] == []

    invalid_player_payload = {
        "scores": [
            {"hole": 1, "player_id": "unknown", "strokes": 5},
        ]
    }

    invalid_player_response = client.post(
        f"/api/trip/rounds/{trip_id}/scores", json=invalid_player_payload
    )
    assert invalid_player_response.status_code == 400
    assert invalid_player_response.json()["detail"] == "invalid_score_entries"

    fetch_after_invalid_player = client.get(f"/api/trip/rounds/{trip_id}")
    assert fetch_after_invalid_player.status_code == 200
    assert fetch_after_invalid_player.json()["scores"] == []

    valid_scores_payload = {
        "scores": [
            {"hole": 1, "player_id": "p1", "strokes": 3},
            {"hole": 2, "player_id": "p2", "strokes": 4},
        ]
    }

    valid_response = client.post(
        f"/api/trip/rounds/{trip_id}/scores", json=valid_scores_payload
    )
    assert valid_response.status_code == 200
    scores = valid_response.json()["scores"]
    assert {(s["hole"], s["player_id"]) for s in scores} == {
        (1, "p1"),
        (2, "p2"),
    }


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
