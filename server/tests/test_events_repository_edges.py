from __future__ import annotations

import importlib
from datetime import datetime, timedelta, timezone

import pytest


events_module = importlib.import_module("server.routes.events")


@pytest.fixture()
def fresh_repo(monkeypatch: pytest.MonkeyPatch):
    repository = events_module._MemoryEventsRepository()
    monkeypatch.setattr(events_module, "_REPOSITORY", repository)
    return repository


def test_normalize_tv_flags_handles_invalid_rotate_interval():
    result = events_module._normalize_tv_flags(
        {"rotateIntervalMs": "oops", "showQrOverlay": True}
    )
    assert (
        result["rotateIntervalMs"] == events_module.DEFAULT_TV_FLAGS["rotateIntervalMs"]
    )
    assert result["showQrOverlay"] is True


def test_register_scorecards_updates_existing_fields(
    fresh_repo: events_module._MemoryEventsRepository,
):
    event = fresh_repo.create_event("Repo Event", None, code="EDGE999")

    first = fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-1",
                "name": "Alpha",
                "memberId": "mem-1",
            }
        ],
    )
    assert first[0]["name"] == "Alpha"

    second = fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-1",
                "name": "Alpha Updated",
                "memberId": "mem-1",
                "hcpIndex": 6.2,
                "courseHandicap": 4,
                "playingHandicap": 5,
                "status": "active",
            }
        ],
    )
    assert second[0]["name"] == "Alpha Updated"
    card = fresh_repo._scorecards[event["id"]]["sc-1"]
    assert card["hcp_index"] == pytest.approx(6.2)
    assert card["course_handicap"] == 4
    assert card["playing_handicap"] == 5
    assert card["status"] == "active"
    assert (event["id"], "mem-1") in fresh_repo._members


def test_upsert_score_missing_scorecard_id_raises_key_error(
    fresh_repo: events_module._MemoryEventsRepository,
):
    event = fresh_repo.create_event("Repo Event", None, code="EDGE998")
    fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-2",
                "name": "Beta",
            }
        ],
    )
    with pytest.raises(KeyError):
        fresh_repo.upsert_score(event["id"], {"hole": 1, "gross": 4})


def test_upsert_score_unknown_scorecard_raises_key_error(
    fresh_repo: events_module._MemoryEventsRepository,
):
    event = fresh_repo.create_event("Repo Event", None, code="EDGE997")
    fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-3",
                "name": "Gamma",
            }
        ],
    )
    with pytest.raises(KeyError):
        fresh_repo.upsert_score(
            event["id"],
            {
                "scorecardId": "missing",
                "hole": 1,
                "gross": 4,
                "revision": 1,
                "fingerprint": "fp",
            },
        )


def test_upsert_score_invalid_hole_raises_value_error(
    fresh_repo: events_module._MemoryEventsRepository,
):
    event = fresh_repo.create_event("Repo Event", None, code="EDGE996")
    fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-4",
                "name": "Delta",
            }
        ],
    )
    with pytest.raises(ValueError):
        fresh_repo.upsert_score(
            event["id"],
            {
                "scorecardId": "sc-4",
                "hole": 0,
                "gross": 4,
                "revision": 1,
                "fingerprint": "fp",
            },
        )


def test_upsert_score_missing_revision_yields_conflict(
    fresh_repo: events_module._MemoryEventsRepository,
):
    event = fresh_repo.create_event("Repo Event", None, code="EDGE995")
    fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-5",
                "name": "Epsilon",
            }
        ],
    )
    fresh_repo.upsert_score(
        event["id"],
        {
            "scorecardId": "sc-5",
            "hole": 1,
            "gross": 4,
            "revision": 1,
            "fingerprint": "fp",
        },
    )
    status, record = fresh_repo.upsert_score(
        event["id"],
        {
            "scorecardId": "sc-5",
            "hole": 1,
            "gross": 3,
            "revision": None,
            "fingerprint": "fp-updated",
        },
    )
    assert status == "conflict"
    assert record["revision"] == 1


def test_upsert_score_updates_card_metadata(
    fresh_repo: events_module._MemoryEventsRepository,
):
    event = fresh_repo.create_event("Repo Event", None, code="EDGE994")
    fresh_repo.register_scorecards(
        event["id"],
        [
            {
                "scorecardId": "sc-6",
                "name": "Zeta",
            }
        ],
    )
    fresh_repo.upsert_score(
        event["id"],
        {
            "scorecardId": "sc-6",
            "hole": 1,
            "gross": 4,
            "revision": 1,
            "fingerprint": "fp",
        },
    )
    fresh_repo.upsert_score(
        event["id"],
        {
            "scorecardId": "sc-6",
            "hole": 1,
            "gross": 4,
            "revision": 2,
            "fingerprint": "fp2",
            "playingHandicap": 7,
            "courseHandicap": 8,
            "hcpIndex": 5.4,
            "format": "Gross",
        },
    )
    card = fresh_repo._scorecards[event["id"]]["sc-6"]
    assert card["playing_handicap"] == 7
    assert card["course_handicap"] == 8
    assert card["hcp_index"] == pytest.approx(5.4)
    assert card["format"] == "gross"


def test_aggregate_scorecards_edge_cases():
    now = datetime.now(timezone.utc)
    rows = [
        {"gross": 4, "hole": 1},  # missing scorecard id triggers continue path
        {
            "scorecard_id": "sc-1",
            "gross": 4,
            "net": 3,
            "stableford": 2,
            "hole": 1,
            "updated_at": now.isoformat(),
            "playing_handicap": 4,
            "course_handicap": 5,
            "format": "Net",
        },
        {
            "scorecard_id": "sc-1",
            "gross": 5,
            "net": 4,
            "stableford": 3,
            "hole": 2,
            "updated_at": (now + timedelta(minutes=1)).isoformat(),
        },
        {
            "scorecard_id": "sc-2",
            "gross": 6,
            "hole": 1,
        },
    ]
    meta = {
        "sc-1": {
            "name": "Alpha",
            "hcp_index": 7.1,
            "updated_at": (now + timedelta(minutes=2)).isoformat(),
            "status": "live",
        },
        "sc-2": {
            "name": "Bravo",
            "updated_at": (now + timedelta(minutes=3)).isoformat(),
        },
        "sc-3": {
            "name": "Charlie",
            "created_at": (now - timedelta(minutes=5)).isoformat(),
        },
    }
    players, updated_at = events_module._aggregate_scorecards(
        rows, meta, mode="stableford"
    )
    names = [player.name for player in players]
    assert names == ["Alpha", "Bravo", "Charlie"]
    alpha = next(player for player in players if player.name == "Alpha")
    assert alpha.net == pytest.approx(7.0)
    assert alpha.stableford == pytest.approx(5.0)
    bravo = next(player for player in players if player.name == "Bravo")
    assert bravo.net == pytest.approx(6.0)
    assert bravo.stableford == pytest.approx(2.0)
    charlie = next(player for player in players if player.name == "Charlie")
    assert charlie.net is None
    assert charlie.hole == 1
    assert updated_at is not None


def test_repository_missing_event_paths(
    fresh_repo: events_module._MemoryEventsRepository,
):
    assert fresh_repo.set_status("missing", "live") is None
    assert fresh_repo.regenerate_code("missing", "NEWCODE") is None
    assert fresh_repo.update_settings("missing", settings={"grossNet": "gross"}) is None
    defaults = fresh_repo._clone_settings_locked("missing")
    assert defaults == {
        "grossNet": events_module.DEFAULT_GROSS_NET,
        "tvFlags": dict(events_module.DEFAULT_TV_FLAGS),
    }


def test_compute_net_simple_branches():
    assert events_module._compute_net_simple(72, None, 18) == 72
    assert events_module._compute_net_simple(72, 10.0, 0) == 72
    assert events_module._compute_net_simple(72, 10.0, 18) == 62
