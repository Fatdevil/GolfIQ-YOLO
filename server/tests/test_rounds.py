from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

import math

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.bag.service import get_player_bag_service
from server.club_distance import get_club_distance_service
from server.rounds.club_distances import compute_baseline_carry
from server.rounds.models import (
    HoleScore,
    RoundScores,
    ShotRecord,
    _optional_float,
    _parse_dt,
)
from server.rounds.service import _sanitize_player_id, RoundService, get_round_service


def _headers(player: str = "player-1") -> dict[str, str]:
    return {"x-api-key": player}


def test_start_and_end_round(round_client) -> None:
    client, _, _ = round_client

    start = client.post(
        "/api/rounds/start",
        json={"courseId": "course-123", "teeName": "Back", "holes": 9},
        headers=_headers(),
    )
    assert start.status_code == 200
    data = start.json()
    assert data["courseId"] == "course-123"
    assert data["holes"] == 9
    assert data["startHole"] == 1
    assert data["status"] == "in_progress"
    assert data["endedAt"] is None
    assert data["reusedActiveRound"] is False

    round_id = data["id"]
    end = client.post(f"/api/rounds/{round_id}/end", headers=_headers())
    assert end.status_code == 200
    ended = end.json()
    assert ended["endedAt"] is not None
    assert ended["status"] == "completed"


def test_end_round_updates_bag_distances(round_client) -> None:
    client, _, service = round_client

    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    shot_resp = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "7i",
            "startLat": 0.0,
            "startLon": 0.0,
            "endLat": 0.0,
            "endLon": 0.0009,
        },
        headers=_headers(),
    )
    assert shot_resp.status_code == 200

    end = client.post(f"/api/rounds/{round_id}/end", headers=_headers())
    assert end.status_code == 200

    bag = get_player_bag_service().get_bag("player-1")
    shots = service.list_shots(player_id="player-1", round_id=round_id)
    expected_carry = compute_baseline_carry(shots[0])
    seven_iron = next(c for c in bag.clubs if c.club_id == "7i")

    assert seven_iron.sample_count == 1
    assert math.isclose(seven_iron.avg_carry_m or 0.0, expected_carry, rel_tol=0.01)

    # Idempotent when ending the round multiple times
    end_again = client.post(f"/api/rounds/{round_id}/end", headers=_headers())
    assert end_again.status_code == 200
    bag_again = get_player_bag_service().get_bag("player-1")
    seven_again = next(c for c in bag_again.clubs if c.club_id == "7i")
    assert seven_again.sample_count == 1


def test_start_round_conflict_returns_active(round_client) -> None:
    client, _, service = round_client

    active = service.start_round(
        player_id="player-1", course_id="c1", tee_name="Blue", holes=18
    )

    response = client.post(
        "/api/rounds/start",
        json={"courseId": "c2"},
        headers=_headers(),
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == active.id
    assert payload["reusedActiveRound"] is True

    rounds = service.list_rounds(player_id="player-1")
    assert len(rounds) == 1


def test_get_current_round(round_client) -> None:
    client, _, service = round_client

    active = service.start_round(
        player_id="player-1", course_id="c1", tee_name="Blue", holes=18
    )

    response = client.get("/api/rounds/current", headers=_headers())
    assert response.status_code == 200
    current = response.json()
    assert current["id"] == active.id
    assert current["status"] == "in_progress"

    service.end_round(player_id="player-1", round_id=active.id)

    empty = client.get("/api/rounds/current", headers=_headers())
    assert empty.status_code == 200
    assert empty.json() is None


def test_get_active_round_summary(round_client) -> None:
    client, _, service = round_client

    active = service.start_round(
        player_id="player-1", course_id="c1", tee_name="Blue", holes=9
    )
    update_resp = client.put(
        f"/api/rounds/{active.id}/scores/1",
        json={"strokes": 4},
        headers=_headers(),
    )
    assert update_resp.status_code == 200

    response = client.get("/api/rounds/active", headers=_headers())
    assert response.status_code == 200
    summary = response.json()
    assert summary["roundId"] == active.id
    assert summary["holesPlayed"] == 1
    assert summary["currentHole"] == 1

    empty = client.get("/api/rounds/active", headers=_headers("other"))
    assert empty.status_code == 204


def test_append_and_list_shots(round_client) -> None:
    client, _, _ = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    shot_resp = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "7i",
            "startLat": 10.0,
            "startLon": 20.0,
            "endLat": 10.001,
            "endLon": 20.001,
            "note": "Fairway",
            "tempoBackswingMs": 900,
            "tempoDownswingMs": 300,
        },
        headers=_headers(),
    )
    assert shot_resp.status_code == 200
    shot = shot_resp.json()
    assert shot["roundId"] == round_id
    assert shot["club"] == "7i"
    assert shot["tempoBackswingMs"] == 900
    assert shot["tempoDownswingMs"] == 300
    assert shot["tempoRatio"] == pytest.approx(900 / 300)

    list_resp = client.get(f"/api/rounds/{round_id}/shots", headers=_headers())
    assert list_resp.status_code == 200
    shots = list_resp.json()
    assert len(shots) == 1
    assert shots[0]["note"] == "Fairway"
    assert shots[0]["tempoBackswingMs"] == 900
    assert shots[0]["tempoDownswingMs"] == 300


def test_append_shot_respects_provided_ratio(round_client) -> None:
    client, _, _ = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    provided_ratio = 2.4
    shot_resp = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "5i",
            "startLat": 10.0,
            "startLon": 20.0,
            "tempoBackswingMs": 960,
            "tempoDownswingMs": 400,
            "tempoRatio": provided_ratio,
        },
        headers=_headers(),
    )
    assert shot_resp.status_code == 200
    shot = shot_resp.json()
    assert shot["tempoBackswingMs"] == 960
    assert shot["tempoDownswingMs"] == 400
    assert shot["tempoRatio"] == provided_ratio


def test_append_shot_handles_zero_downswing(round_client) -> None:
    client, _, _ = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    shot_resp = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "5i",
            "startLat": 10.0,
            "startLon": 20.0,
            "tempoBackswingMs": 960,
            "tempoDownswingMs": 0,
        },
        headers=_headers(),
    )
    assert shot_resp.status_code == 200
    shot = shot_resp.json()
    assert shot["tempoDownswingMs"] == 0
    assert shot["tempoRatio"] is None


def test_shot_ingests_into_club_distance(round_client) -> None:
    client, club_service, _ = round_client
    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    response = client.post(
        f"/api/rounds/{round_id}/shots",
        json={
            "holeNumber": 1,
            "club": "PW",
            "startLat": 59.0,
            "startLon": 18.0,
            "endLat": 59.0005,
            "endLon": 18.0005,
        },
        headers=_headers(),
    )
    assert response.status_code == 200

    stats = club_service.get_stats_for_club("player-1", "PW")
    assert stats.samples == 1
    assert stats.last_updated <= datetime.now(timezone.utc)


def test_player_id_sanitization_valid(tmp_path) -> None:
    service = RoundService(base_dir=tmp_path)
    path = service._player_dir("user_123-abc")
    assert path.name == "user_123-abc"
    assert path.parent == tmp_path


def test_player_id_sanitization_rejects_traversal(tmp_path) -> None:
    with pytest.raises(ValueError):
        _sanitize_player_id("../evil")

    service = RoundService(base_dir=tmp_path)
    with pytest.raises(ValueError):
        service.start_round(
            player_id="../../tmp/evil", course_id=None, tee_name=None, holes=18
        )

    # Router should surface 400 when traversal is attempted
    client = TestClient(app)
    response = client.post("/api/rounds/start", json={}, headers=_headers("../evil"))
    assert response.status_code == 400


def test_end_round_missing_and_forbidden(round_client) -> None:
    client, _, _ = round_client

    missing = client.post("/api/rounds/does-not-exist/end", headers=_headers())
    assert missing.status_code == 404

    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    forbidden = client.post(
        f"/api/rounds/{round_id}/end", headers=_headers("someone-else")
    )
    assert forbidden.status_code == 403


def test_append_shot_missing_and_forbidden(round_client) -> None:
    client, _, _ = round_client
    base_payload = {
        "holeNumber": 1,
        "club": "8i",
        "startLat": 1.0,
        "startLon": 2.0,
    }

    missing = client.post(
        "/api/rounds/does-not-exist/shots", json=base_payload, headers=_headers()
    )
    assert missing.status_code == 404

    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    forbidden = client.post(
        f"/api/rounds/{round_id}/shots",
        json=base_payload,
        headers=_headers("stranger"),
    )
    assert forbidden.status_code == 403


def test_list_shots_missing_and_forbidden(round_client) -> None:
    client, _, _ = round_client
    missing = client.get("/api/rounds/nope/shots", headers=_headers())
    assert missing.status_code == 404

    start = client.post("/api/rounds/start", json={}, headers=_headers()).json()
    round_id = start["id"]

    forbidden = client.get(
        f"/api/rounds/{round_id}/shots", headers=_headers("different")
    )
    assert forbidden.status_code == 403


def test_round_endpoints_reject_invalid_player_headers() -> None:
    client = TestClient(app)
    bad_headers = _headers("../bad")

    start_resp = client.post("/api/rounds/start", json={}, headers=bad_headers)
    assert start_resp.status_code == 400

    append_resp = client.post(
        "/api/rounds/bad/shots",
        json={"holeNumber": 1, "club": "7i", "startLat": 0.0, "startLon": 0.0},
        headers=bad_headers,
    )
    assert append_resp.status_code == 404

    end_resp = client.post("/api/rounds/bad/end", json={}, headers=bad_headers)
    assert end_resp.status_code == 404

    list_shots = client.get("/api/rounds/bad/shots", headers=bad_headers)
    assert list_shots.status_code == 404

    list_rounds = client.get("/api/rounds", headers=bad_headers)
    assert list_rounds.status_code == 400


def test_round_router_surfaces_value_errors() -> None:
    class ErrorService:
        def end_round(self, **_: object):
            raise ValueError("bad player")

        def append_shot(self, **_: object):
            raise ValueError("bad player")

        def list_shots(self, **_: object):
            raise ValueError("bad player")

        def list_rounds(self, **_: object):
            raise ValueError("bad player")

    class DummyClub:
        def ingest_shot_from_round(self, _: object) -> None:
            return None

    app.dependency_overrides[get_round_service] = lambda: ErrorService()
    app.dependency_overrides[get_club_distance_service] = lambda: DummyClub()
    client = TestClient(app)

    try:
        end_resp = client.post("/api/rounds/bad/end", headers=_headers())
        assert end_resp.status_code == 400

        append_resp = client.post(
            "/api/rounds/bad/shots",
            json={"holeNumber": 1, "club": "7i", "startLat": 0.0, "startLon": 0.0},
            headers=_headers(),
        )
        assert append_resp.status_code == 400

        list_resp = client.get("/api/rounds/bad/shots", headers=_headers())
        assert list_resp.status_code == 400

        rounds_resp = client.get("/api/rounds", headers=_headers())
        assert rounds_resp.status_code == 400
    finally:
        app.dependency_overrides.pop(get_round_service, None)
        app.dependency_overrides.pop(get_club_distance_service, None)


def test_list_rounds_empty_and_skips_invalid_metadata(round_client, tmp_path) -> None:
    client, _, service = round_client

    empty = client.get("/api/rounds", headers=_headers())
    assert empty.status_code == 200
    assert empty.json() == []

    bad_round_dir = service._round_dir("player-1", "bad-round")
    bad_round_dir.mkdir(parents=True)
    (bad_round_dir / "round.json").write_text("{ not json }")

    response = client.get("/api/rounds", headers=_headers())
    assert response.status_code == 200
    assert response.json() == []


def test_list_rounds_limit_and_skips_missing_meta(tmp_path) -> None:
    service = RoundService(base_dir=tmp_path)

    missing_meta_dir = service._round_dir("player-1", "no-meta")
    missing_meta_dir.mkdir(parents=True)

    first = service.start_round(
        player_id="player-1", course_id=None, tee_name=None, holes=18
    )
    second = service.start_round(
        player_id="player-1", course_id=None, tee_name=None, holes=18
    )

    rounds = service.list_rounds(player_id="player-1", limit=1)
    assert len(rounds) == 1
    assert rounds[0].id in {first.id, second.id}


def test_list_rounds_returns_recent_rounds_for_player(round_client) -> None:
    client, _, service = round_client

    older = service.start_round(
        player_id="player-1", course_id=None, tee_name="Blue", holes=18
    )
    newer = service.start_round(
        player_id="player-1", course_id="course-2", tee_name="White", holes=9
    )
    service.start_round(player_id="other", course_id=None, tee_name=None, holes=18)

    older_record = service._load_round(older.id)
    newer_record = service._load_round(newer.id)
    assert older_record and newer_record
    older_record.started_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    newer_record.started_at = datetime(2024, 2, 1, tzinfo=timezone.utc)
    newer_record.ended_at = datetime(2024, 2, 2, tzinfo=timezone.utc)
    service._write_round(older_record)
    service._write_round(newer_record)

    response = client.get("/api/rounds?limit=2", headers=_headers())
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == [newer.id, older.id]
    assert all(item["playerId"] == "player-1" for item in payload)


def test_round_summaries_endpoint_aggregates_summaries(round_client) -> None:
    client, _, service = round_client

    first = service.start_round(
        player_id="player-1", course_id="c1", tee_name="Blue", holes=18
    )
    second = service.start_round(
        player_id="player-1", course_id="c2", tee_name="White", holes=18
    )

    first_record = service._load_round(first.id)
    second_record = service._load_round(second.id)
    assert first_record and second_record
    first_record.started_at = datetime(2024, 2, 1, tzinfo=timezone.utc)
    second_record.started_at = datetime(2024, 3, 1, tzinfo=timezone.utc)
    service._write_round(first_record)
    service._write_round(second_record)

    first_scores = RoundScores(
        round_id=first.id,
        player_id="player-1",
        holes={
            1: HoleScore(hole_number=1, par=4, strokes=5, putts=2, fairway_hit=True),
            2: HoleScore(hole_number=2, par=3, strokes=3, putts=1, gir=True),
        },
    )
    service._write_scores(first_scores)

    second_scores = RoundScores(
        round_id=second.id,
        player_id="player-1",
        holes={
            1: HoleScore(
                hole_number=1, par=5, strokes=6, putts=3, fairway_hit=False, gir=False
            ),
            2: HoleScore(
                hole_number=2, par=4, strokes=4, putts=2, fairway_hit=True, gir=True
            ),
        },
    )
    service._write_scores(second_scores)

    response = client.get("/api/rounds/summaries?limit=5", headers=_headers())
    assert response.status_code == 200
    summaries = response.json()
    assert len(summaries) == 2
    assert summaries[0]["roundId"] == second.id
    assert summaries[0]["totalStrokes"] == 10
    assert summaries[0]["totalPar"] == 9
    assert summaries[0]["totalToPar"] == 1
    assert summaries[0]["totalPutts"] == 5
    assert summaries[0]["fairwaysHit"] == 1
    assert summaries[0]["fairwaysTotal"] == 2

    assert summaries[1]["roundId"] == first.id
    assert summaries[1]["totalStrokes"] == 8
    assert summaries[1]["totalPar"] == 7
    assert summaries[1]["totalToPar"] == 1
    assert summaries[1]["totalPutts"] == 3
    assert summaries[1]["girCount"] == 1


def test_read_shot_records_skips_invalid_lines(tmp_path) -> None:
    service = RoundService(base_dir=tmp_path)
    round_id = "round-1"
    valid_shot = ShotRecord(
        id=str(uuid4()),
        round_id=round_id,
        player_id="player-1",
        hole_number=1,
        club="9i",
        created_at=datetime.now(timezone.utc),
        start_lat=10.0,
        start_lon=20.0,
        end_lat=None,
        end_lon=None,
        wind_speed_mps=None,
        wind_direction_deg=None,
        elevation_delta_m=None,
        note=None,
    )
    round_dir = service._round_dir("player-1", round_id)
    round_dir.mkdir(parents=True)
    shots_path = round_dir / "shots.jsonl"
    shots_path.write_text(json.dumps(valid_shot.to_dict()) + "\ninvalid json\n   \n")

    records = list(service._read_shot_records(round_id))
    assert len(records) == 1
    assert records[0].id == valid_shot.id


def test_read_shot_records_skips_missing_files(tmp_path) -> None:
    service = RoundService(base_dir=tmp_path)
    empty_round_dir = service._round_dir("player-2", "empty-round")
    empty_round_dir.mkdir(parents=True, exist_ok=True)

    round_id = "round-with-shots"
    populated_dir = service._round_dir("player-1", round_id)
    populated_dir.mkdir(parents=True, exist_ok=True)
    shot = ShotRecord(
        id=str(uuid4()),
        round_id=round_id,
        player_id="player-1",
        hole_number=1,
        club="D",
        created_at=datetime.now(timezone.utc),
        start_lat=1.0,
        start_lon=1.0,
        end_lat=None,
        end_lon=None,
        wind_speed_mps=None,
        wind_direction_deg=None,
        elevation_delta_m=None,
        note=None,
    )
    (populated_dir / "shots.jsonl").write_text(json.dumps(shot.to_dict()) + "\n")

    records = list(service._read_shot_records(round_id))
    assert len(records) == 1
    assert records[0].id == shot.id


def test_read_shot_records_handles_missing_tempo_fields(tmp_path) -> None:
    service = RoundService(base_dir=tmp_path)
    round_id = "round-old-format"
    shot_id = str(uuid4())

    legacy_shot = {
        "id": shot_id,
        "round_id": round_id,
        "player_id": "player-1",
        "hole_number": 1,
        "club": "7i",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "start_lat": 1.0,
        "start_lon": 2.0,
        "end_lat": None,
        "end_lon": None,
        "wind_speed_mps": None,
        "wind_direction_deg": None,
        "elevation_delta_m": None,
        "note": None,
    }

    round_dir = service._round_dir("player-1", round_id)
    round_dir.mkdir(parents=True, exist_ok=True)
    (round_dir / "shots.jsonl").write_text(json.dumps(legacy_shot) + "\n")

    records = list(service._read_shot_records(round_id))

    assert len(records) == 1
    assert records[0].id == shot_id
    assert records[0].tempo_backswing_ms is None
    assert records[0].tempo_downswing_ms is None
    assert records[0].tempo_ratio is None


def test_load_round_returns_none_for_corrupt_payload(tmp_path) -> None:
    service = RoundService(base_dir=tmp_path)
    round_dir = service._round_dir("player-1", "corrupt")
    round_dir.mkdir(parents=True)
    (round_dir / "round.json").write_text("{not-json")

    assert service._load_round("corrupt") is None


def test_parse_dt_and_optional_float_helpers() -> None:
    naive = _parse_dt("2024-01-02T03:04:05")
    assert naive.tzinfo == timezone.utc

    assert _optional_float("not-a-number") is None
