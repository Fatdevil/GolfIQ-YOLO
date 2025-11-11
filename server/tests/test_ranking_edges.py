from __future__ import annotations

from datetime import datetime, timedelta, timezone

from server.services.ranking import _ensure_float, rank_top_shots


def _ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def test_future_and_zero_recency_get_no_bonus() -> None:
    now = datetime.now(timezone.utc)
    clips = [
        {
            "id": "past",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _ts(now - timedelta(minutes=10)),
        },
        {
            "id": "future",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _ts(now + timedelta(minutes=1)),
        },
        {
            "id": "zero",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _ts(now),
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


def test_ensure_float_handles_nan_and_none() -> None:
    assert _ensure_float(None, 0.5) == 0.5
    nan_value = float("nan")
    assert _ensure_float(nan_value, 0.7) == 0.7
