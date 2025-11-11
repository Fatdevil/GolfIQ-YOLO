from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


def test_score_submission_is_idempotent_with_header():
    with TestClient(app) as client:
        event = client.post("/events", json={"name": "Offline Test"}).json()
        event_id = event["id"]

        client.post(
            f"/events/{event_id}/players",
            json={"players": [{"scorecardId": "card-1", "name": "Alice"}]},
        )

        payload = {"scorecardId": "card-1", "hole": 1, "gross": 4}
        headers = {"X-Client-Req-Id": "req-123"}

        first = client.post(f"/events/{event_id}/score", json=payload, headers=headers)
        assert first.status_code in (200, 201)
        assert first.json().get("idempotent") is not True

        second = client.post(f"/events/{event_id}/score", json=payload, headers=headers)
        assert second.status_code == 200
        assert second.json().get("idempotent") is True
