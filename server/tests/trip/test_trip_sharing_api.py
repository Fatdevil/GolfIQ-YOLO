from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.trip import store

client = TestClient(app)


def _clear_store() -> None:
    store._TRIPS.clear()  # type: ignore[attr-defined]


def test_issue_public_token_and_fetch_public_trip_round():
    _clear_store()

    create_payload = {
        "courseName": "St. Andrews",
        "courseId": "course_sa",
        "teesName": "Old Course",
        "holes": 18,
        "players": ["Alice", "Bob"],
    }

    create_response = client.post("/api/trip/rounds", json=create_payload)
    assert create_response.status_code == 200
    trip_id = create_response.json()["id"]

    share_response = client.post(f"/api/trip/rounds/{trip_id}/share")
    assert share_response.status_code == 200
    token = share_response.json()["publicToken"]
    assert isinstance(token, str)
    assert len(token) >= 10

    repeat_share_response = client.post(f"/api/trip/rounds/{trip_id}/share")
    assert repeat_share_response.status_code == 200
    assert repeat_share_response.json()["publicToken"] == token

    public_response = client.get(f"/public/trip/rounds/{token}")
    assert public_response.status_code == 200
    data = public_response.json()
    assert data["course_name"] == "St. Andrews"
    assert len(data["players"]) == 2
    assert data["scores"] == []

    missing_response = client.get("/public/trip/rounds/unknown-token")
    assert missing_response.status_code == 404
    assert missing_response.json()["detail"] == "trip_not_found"
