import json

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.rounds.models import (
    HoleScore,
    RoundScores,
    _optional_float,
    _optional_int,
    compute_round_summary,
)
from server.rounds.service import RoundService, get_round_service


@pytest.fixture
def round_client(tmp_path):
    service = RoundService(base_dir=tmp_path)
    app.dependency_overrides[get_round_service] = lambda: service
    client = TestClient(app)
    yield client, service
    app.dependency_overrides.pop(get_round_service, None)


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def _start_round(client: TestClient) -> str:
    response = client.post("/api/rounds/start", json={}, headers=_headers())
    assert response.status_code == 200
    return response.json()["id"]


def test_update_and_get_scores(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    hole_one = client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 5, "putts": 2, "fairwayHit": True, "gir": False},
        headers=_headers(),
    )
    assert hole_one.status_code == 200

    hole_two = client.put(
        f"/api/rounds/{round_id}/scores/2",
        json={"par": 3, "strokes": 3, "putts": 1, "gir": True},
        headers=_headers(),
    )
    assert hole_two.status_code == 200

    fetched = client.get(f"/api/rounds/{round_id}/scores", headers=_headers())
    assert fetched.status_code == 200
    scores = fetched.json()
    assert scores["roundId"] == round_id
    assert scores["holes"]["1"]["strokes"] == 5
    assert scores["holes"]["1"]["fairwayHit"] is True
    assert scores["holes"]["2"]["putts"] == 1


def test_summary_endpoint(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 5, "putts": 2, "fairwayHit": True, "gir": True},
        headers=_headers(),
    )
    client.put(
        f"/api/rounds/{round_id}/scores/10",
        json={"par": 5, "strokes": 6, "putts": 2, "penalties": 1, "fairwayHit": False},
        headers=_headers(),
    )

    response = client.get(f"/api/rounds/{round_id}/summary", headers=_headers())
    assert response.status_code == 200
    summary = response.json()

    assert summary["totalStrokes"] == 11
    assert summary["totalPar"] == 9
    assert summary["totalToPar"] == 2
    assert summary["frontStrokes"] == 5
    assert summary["backStrokes"] == 6
    assert summary["totalPutts"] == 4
    assert summary["totalPenalties"] == 1
    assert summary["fairwaysHit"] == 1
    assert summary["fairwaysTotal"] == 2
    assert summary["girCount"] == 1
    assert summary["holesPlayed"] == 2


def test_scores_require_ownership(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    forbidden_get = client.get(
        f"/api/rounds/{round_id}/scores", headers=_headers("other")
    )
    assert forbidden_get.status_code == 403

    forbidden_put = client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"strokes": 4},
        headers=_headers("other"),
    )
    assert forbidden_put.status_code == 403


def test_get_scores_round_not_found(round_client):
    client, _ = round_client
    response = client.get("/api/rounds/does-not-exist/scores", headers=_headers())
    assert response.status_code == 404


def test_upsert_round_not_found(round_client):
    client, _ = round_client
    response = client.put(
        "/api/rounds/does-not-exist/scores/1",
        json={"strokes": 4},
        headers=_headers(),
    )
    assert response.status_code == 404


def test_update_pars_overwrites_and_adds(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    client.put(
        f"/api/rounds/{round_id}/scores/1",
        json={"par": 4, "strokes": 5},
        headers=_headers(),
    )

    response = client.put(
        f"/api/rounds/{round_id}/pars",
        json={"pars": {"1": 5, "3": 4}},
        headers=_headers(),
    )
    assert response.status_code == 200

    fetched = client.get(f"/api/rounds/{round_id}/scores", headers=_headers())
    scores = fetched.json()["holes"]

    assert scores["1"]["par"] == 5
    assert scores["1"]["strokes"] == 5  # strokes are preserved
    assert scores["3"]["par"] == 4
    assert scores["3"].get("strokes") is None


def test_update_pars_round_not_found(round_client):
    client, _ = round_client
    response = client.put(
        "/api/rounds/does-not-exist/pars",
        json={"pars": {"1": 4}},
        headers=_headers(),
    )

    assert response.status_code == 404


def test_upsert_rejects_invalid_hole(round_client):
    client, _ = round_client
    round_id = _start_round(client)

    response = client.put(
        f"/api/rounds/{round_id}/scores/0",
        json={"par": 4},
        headers=_headers(),
    )

    assert response.status_code == 400


def test_scores_file_with_bad_entries_is_tolerated(round_client):
    client, service = round_client
    round_id = _start_round(client)

    record = service._load_round(round_id)
    scores_path = service._round_dir(record.player_id, record.id) / "scores.json"
    scores_path.parent.mkdir(parents=True, exist_ok=True)
    scores_path.write_text(
        json.dumps(
            {
                "round_id": record.id,
                "player_id": record.player_id,
                "holes": {
                    "bad": {"par": 4},
                    "2": {"par": 5, "strokes": "oops"},
                },
            }
        )
    )

    fetched = client.get(f"/api/rounds/{round_id}/scores", headers=_headers())
    assert fetched.status_code == 200

    # invalid entries are skipped and do not break parsing
    assert fetched.json()["holes"] == {}


def test_round_summary_handles_empty_and_partial_scores():
    empty_scores = RoundScores(round_id="r1", player_id="p1", holes={})
    empty_summary = compute_round_summary(empty_scores)

    assert empty_summary.total_strokes is None
    assert empty_summary.total_par is None
    assert empty_summary.total_putts is None
    assert empty_summary.fairways_hit is None
    assert empty_summary.gir_count is None
    assert empty_summary.holes_played == 0

    partial_scores = RoundScores(
        round_id="r2",
        player_id="p1",
        holes={
            4: HoleScore(hole_number=4, par=4, strokes=None, fairway_hit=True),
            12: HoleScore(hole_number=12, par=5, strokes=6, putts=2, fairway_hit=False),
        },
    )

    partial_summary = compute_round_summary(partial_scores)

    assert partial_summary.total_par == 9
    assert partial_summary.total_strokes == 6
    assert partial_summary.total_putts == 2
    assert partial_summary.front_strokes is None  # no front strokes recorded
    assert partial_summary.back_strokes == 6
    assert partial_summary.fairways_total == 2
    assert partial_summary.fairways_hit == 1
    assert partial_summary.gir_count == 0


def test_round_summary_guard_and_invalid_files(round_client):
    client, service = round_client
    round_id = _start_round(client)

    wrong_player_summary = client.get(
        f"/api/rounds/{round_id}/summary", headers=_headers("other")
    )
    assert wrong_player_summary.status_code == 403

    record = service._load_round(round_id)
    scores_path = service._round_dir(record.player_id, record.id) / "scores.json"
    scores_path.write_text("not-json")

    bad_scores = client.get(f"/api/rounds/{round_id}/scores", headers=_headers())
    assert bad_scores.status_code == 200
    assert bad_scores.json()["holes"] == {}


def test_optional_number_helpers():
    assert _optional_int("3") == 3
    assert _optional_int("bogus") is None
    assert _optional_float("1.5") == 1.5
    assert _optional_float("bogus") is None
