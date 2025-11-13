from __future__ import annotations

from server.api.routers.run_scores import (
    _RECORDED_EVENTS,
    _reset_state as reset_run_events,
)
from server.sg.compile import _infer_lie_after, compile_shot_events, run_events_snapshot


def setup_module(_) -> None:
    reset_run_events()


def teardown_module(_) -> None:
    reset_run_events()


def test_run_events_snapshot_orders_by_timestamp_and_payload():
    run_id = "snapshot-run"
    _RECORDED_EVENTS[run_id] = {
        "b": {"ts": 2, "kind": "shot", "payload": {"hole": 1, "shot": 2}},
        "a": {"ts": 1, "kind": "shot", "payload": {"hole": 1, "shot": 1}},
        "c": {"ts": 2, "kind": "shot", "payload": {"hole": 1, "shot": 1, "extra": 1}},
    }

    snapshot = run_events_snapshot(run_id)
    assert [event["payload"]["shot"] for event in snapshot] == [1, 1, 2]


def test_infer_lie_after_covers_edge_cases():
    assert _infer_lie_after({"lie_after": "rough"}, 150.0, "fairway") == "rough"
    assert _infer_lie_after({}, 0.0, "fairway") == "holed"
    assert _infer_lie_after({}, 10.0, "rough") == "green"
    assert _infer_lie_after({}, 40.0, "green") == "green"
    assert _infer_lie_after({}, 80.0, "rough") == "rough"


def test_compile_shot_events_filters_invalid_entries():
    run_id = "compile-run"
    _RECORDED_EVENTS[run_id] = {
        "ignore-kind": {"ts": 1, "kind": "other", "payload": {"hole": 1, "shot": 1}},
        "missing-fields": {"ts": 2, "kind": "shot", "payload": {"hole": 1}},
        "bad-distances": {
            "ts": 3,
            "kind": "shot",
            "payload": {"hole": 1, "shot": 2, "distance_before_m": "bad"},
        },
        "valid": {
            "ts": 4,
            "kind": "shot",
            "payload": {
                "hole": 2,
                "shot": 1,
                "distance_before_m": 50.0,
                "distance_after_m": 10.0,
                "lie_before": "rough",
            },
        },
        "holed": {
            "ts": 5,
            "kind": "shot",
            "payload": {
                "hole": 2,
                "shot": 2,
                "distance_before_m": 10.0,
                "distance_after_m": 0.0,
                "lie_before": "green",
            },
        },
    }

    shots = compile_shot_events(run_id)
    assert [(shot.hole, shot.shot, shot.lie_after) for shot in shots] == [
        (2, 1, "green"),
        (2, 2, "holed"),
    ]
