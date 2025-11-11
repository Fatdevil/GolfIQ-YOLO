from __future__ import annotations

from server.services import ranking


def test_rank_top_shots_deterministic_order() -> None:
    now_ts = 1_704_000_000.0
    clips = [
        {
            "id": "clip-a",
            "sg_delta": 0.8,
            "reactions_1min": 12,
            "reactions_total": 40,
            "created_at": "2024-01-10T12:00:00Z",
        },
        {
            "id": "clip-b",
            "sg_delta": 1.4,
            "reactions_1min": 6,
            "reactions_total": 18,
            "created_at": "2024-01-10T12:10:00Z",
        },
        {
            "id": "clip-c",
            "sg_delta": -0.2,
            "reactions_1min": 14,
            "reactions_total": 60,
            "created_at": "2023-12-31T23:50:00Z",
        },
    ]

    ranked = ranking.rank_top_shots(clips, now_ts, alpha=0.6, beta=1.0, gamma=0.3)
    order = [entry["id"] for entry in ranked]
    assert order == ["clip-c", "clip-a", "clip-b"]
    assert ranked[0]["score"] > ranked[1]["score"] > ranked[2]["score"]


def test_rank_top_shots_handles_missing_fields() -> None:
    ranked = ranking.rank_top_shots(
        [
            {"id": "clip-1"},
            {"id": "clip-2", "sgDelta": 0.5},
        ],
        1_704_000_000.0,
    )
    assert [entry["id"] for entry in ranked] == ["clip-2", "clip-1"]
