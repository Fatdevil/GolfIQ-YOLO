from __future__ import annotations

from datetime import datetime, timedelta, timezone

from server.services.ranking import _ensure_float, _parse_timestamp, rank_top_shots


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def test_recency_future_and_zero_have_no_bonus() -> None:
    now = datetime.now(timezone.utc)
    clips = [
        {
            "id": "past",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _iso(now - timedelta(minutes=10)),
        },
        {
            "id": "future",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _iso(now + timedelta(minutes=1)),
        },
        {
            "id": "zero",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _iso(now),
        },
        {
            "id": "alts",
            "reactions1min": 2,
            "reactionsTotal": 3,
            "sgDelta": 0.4,
            "createdAt": _iso(now - timedelta(minutes=5)),
        },
    ]

    ranked = rank_top_shots(
        clips,
        now_ts=now.timestamp(),
        alpha=0.6,
        beta=1.0,
        gamma=0.3,
    )
    ids = [clip["id"] for clip in ranked]

    assert ids.index("future") >= ids.index("past")
    assert ids.index("zero") >= ids.index("past")
    assert "alts" in ids


def test_ranking_parses_various_timestamps_and_ignores_bad() -> None:
    now = datetime.now(timezone.utc)
    clips = [
        {
            "id": "epoch",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": str(now.timestamp()),
        },
        {
            "id": "bad",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": "not-a-time",
        },
    ]

    rank_top_shots(
        clips,
        now_ts=now.timestamp(),
        alpha=0.6,
        beta=1.0,
        gamma=0.3,
    )


def test_ensure_float_handles_none_str_nan() -> None:
    nan = float("nan")

    assert _ensure_float(None, 0.5) == 0.5
    assert _ensure_float("3.25", 0.0) == 3.25
    assert _ensure_float(nan, 0.7) == 0.7


def test_parse_timestamp_handles_datetime_numeric_and_other() -> None:
    naive = datetime(2024, 1, 1, 12, 0, 0)
    parsed = _parse_timestamp(naive)
    assert parsed.tzinfo == timezone.utc

    numeric = _parse_timestamp(1_700_000_000)
    assert numeric.tzinfo == timezone.utc

    assert _parse_timestamp(object()) is None


def test_ensure_float_handles_invalid_string() -> None:
    assert _ensure_float("not-a-number", 1.25) == 1.25
