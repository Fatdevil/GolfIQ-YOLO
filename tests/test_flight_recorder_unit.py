from __future__ import annotations

from pathlib import Path

import pytest

from server import flight_recorder


class DummyRandom:
    def __init__(self, values: list[float]) -> None:
        self._values = values
        self._index = 0

    def random(self) -> float:
        if self._index >= len(self._values):
            raise AssertionError("No more dummy random values")
        value = self._values[self._index]
        self._index += 1
        return value


@pytest.mark.parametrize(
    "pct, expected",
    [
        (0.0, False),
        (100.0, True),
    ],
)
def test_should_record_extremes(pct: float, expected: bool) -> None:
    assert flight_recorder.should_record(pct) is expected


def test_should_record_within_range(monkeypatch) -> None:
    dummy = DummyRandom([0.049, 0.2])
    monkeypatch.setattr(flight_recorder, "_rng", dummy)

    # 0.049 * 100 == 4.9 -> True when threshold is 5%
    assert flight_recorder.should_record(5.0) is True

    # 0.2 * 100 == 20 -> False when threshold is 10%
    assert flight_recorder.should_record(10.0) is False


def test_record_appends_json_lines(tmp_path: Path) -> None:
    payload_one = {"foo": "bar"}
    payload_two = {"baz": 2}

    path = flight_recorder.record(payload_one, tmp_path)
    second_path = flight_recorder.record(payload_two, tmp_path)

    assert path == second_path
    content = path.read_text(encoding="utf-8").splitlines()
    assert content == ['{"foo":"bar"}', '{"baz":2}']
