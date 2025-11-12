from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Event
from time import sleep

from server.api.routers.run_scores import (
    _RECORDED_EVENTS,
    _RECORDED_EVENTS_LOCK,
    _reset_state,
)
from server.sg.compile import run_events_snapshot


def test_run_events_snapshot_atomic_under_writer_lock():
    run_id = "snap-lock"
    _reset_state()

    with _RECORDED_EVENTS_LOCK:
        _RECORDED_EVENTS[run_id] = {}

    stop_event = Event()

    def writer() -> None:
        for idx in range(200):
            with _RECORDED_EVENTS_LOCK:
                events_for_run = _RECORDED_EVENTS.setdefault(run_id, {})
                events_for_run[f"shot-{idx}"] = {
                    "ts": idx,
                    "kind": "shot",
                    "payload": {
                        "hole": 1,
                        "shot": 1,
                        "before_m": 150,
                        "after_m": 5,
                        "before_lie": "fairway",
                    },
                }
                if idx % 5 == 0 and idx > 0:
                    events_for_run.pop(f"shot-{idx-3}", None)
            sleep(0)
        stop_event.set()

    def reader() -> None:
        while not stop_event.is_set():
            snapshot = run_events_snapshot(run_id)
            ts_values = [event.get("ts", 0) for event in snapshot]
            assert ts_values == sorted(ts_values)
        # one more pass after writers finished
        snapshot = run_events_snapshot(run_id)
        ts_values = [event.get("ts", 0) for event in snapshot]
        assert ts_values == sorted(ts_values)

    with ThreadPoolExecutor(max_workers=2) as pool:
        writer_future = pool.submit(writer)
        reader_future = pool.submit(reader)
        writer_future.result()
        reader_future.result()

    snapshot = run_events_snapshot(run_id)
    ts_values = [event.get("ts", 0) for event in snapshot]
    assert ts_values == sorted(ts_values)
