from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from server.services.ranking import rank_top_shots


def _ts(offset_minutes: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=offset_minutes)).isoformat()


def test_future_timestamp_has_no_recency_bonus():
    now = datetime.now(timezone.utc)
    now_ts = now.timestamp()
    clips = [
        {
            "id": "past",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _ts(-10),
        },
        {
            "id": "future",
            "reactions_1min": 0,
            "reactions_total": 0,
            "sg_delta": 0.0,
            "created_at": _ts(1),
        },
    ]

    ranked = rank_top_shots(clips, now_ts=now_ts, alpha=0.6, beta=1.0, gamma=0.3)

    scores = {entry["id"]: entry["score"] for entry in ranked}
    assert "past" in scores and "future" in scores
    assert (scores["future"] - scores["past"]) <= 1e-9
    past_created = datetime.fromisoformat(clips[0]["created_at"])
    if past_created.tzinfo is None:
        past_created = past_created.replace(tzinfo=timezone.utc)
    minutes_delta = (now - past_created).total_seconds() / 60.0
    expected_past = 0.3 * (1.0 / minutes_delta)
    assert scores["future"] == pytest.approx(0.0, abs=1e-9)
    assert scores["past"] == pytest.approx(expected_past, rel=1e-6)
