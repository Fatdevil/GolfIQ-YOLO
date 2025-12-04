from __future__ import annotations


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def test_latest_round_requires_auth(round_client):
    client, _, _ = round_client

    response = client.get("/api/rounds/latest")
    assert response.status_code in (401, 403)


def test_latest_round_returns_most_recent_completed(round_client, monkeypatch):
    client, _, service = round_client
    # ensure deterministic timestamps
    monkeypatch.setenv("TZ", "UTC")

    first = service.start_round(
        player_id="player-1", course_id="c1", tee_name="Blue", holes=18
    )
    service.upsert_hole_score(
        player_id="player-1",
        round_id=first.id,
        hole_number=1,
        updates={"par": 4, "strokes": 5},
    )
    service.end_round(player_id="player-1", round_id=first.id)

    second = service.start_round(
        player_id="player-1", course_id="c2", tee_name="White", holes=9
    )
    service.upsert_hole_score(
        player_id="player-1",
        round_id=second.id,
        hole_number=1,
        updates={"par": 3, "strokes": 3},
    )
    service.end_round(player_id="player-1", round_id=second.id)

    response = client.get("/api/rounds/latest", headers=_headers())
    assert response.status_code == 200
    payload = response.json()
    assert payload["roundId"] == second.id
    assert payload["courseId"] == "c2"
    assert payload["teeName"] == "White"
    assert payload["holes"] == 9
    assert payload["totalStrokes"] == 3
    assert payload["totalToPar"] == 0
