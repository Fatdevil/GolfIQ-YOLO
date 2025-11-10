from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from server import flight_recorder


@pytest.mark.parametrize(
    "pct, expected",
    [(-5, False), (0, False), (100, True), (150, True)],
)
def test_should_record_thresholds(pct: float, expected: bool) -> None:
    assert flight_recorder.should_record(pct) is expected


def test_should_record_uses_random(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(flight_recorder._rng, "random", lambda: 0.6)
    assert not flight_recorder.should_record(50)

    monkeypatch.setattr(flight_recorder._rng, "random", lambda: 0.3)
    assert flight_recorder.should_record(50)


def test_record_appends_event(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    fixed_now = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)

    class _FakeDatetime:
        @staticmethod
        def now(tz=None):
            return fixed_now

    monkeypatch.setattr(flight_recorder, "datetime", _FakeDatetime)

    target = flight_recorder.record({"id": "clip-1", "value": 42}, tmp_path)
    assert target.name == "flight-2024-01-01.jsonl"

    contents = target.read_text(encoding="utf-8").splitlines()
    assert contents == [
        json.dumps({"id": "clip-1", "value": 42}, separators=(",", ":"))
    ]
