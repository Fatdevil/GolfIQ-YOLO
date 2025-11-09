from __future__ import annotations

import importlib
import math
import secrets
from datetime import datetime, timezone
from typing import Mapping

import pytest


_events = importlib.import_module("server.routes.events")


@pytest.fixture(autouse=True)
def _reset_repo(monkeypatch):
    monkeypatch.delenv("REQUIRE_API_KEY", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    repo = _events._MemoryEventsRepository()
    monkeypatch.setattr(_events, "_REPOSITORY", repo)
    yield repo


def test_random_indexes_zero_returns_empty():
    assert _events._random_indexes(0) == []


def test_random_indexes_uses_token_bytes(monkeypatch):
    calls: list[int] = []

    def fake_token_bytes(count: int) -> bytes:
        calls.append(count)
        return bytes(range(count))

    monkeypatch.setattr(secrets, "token_bytes", fake_token_bytes)

    indexes = _events._random_indexes(4)

    assert calls == [4]
    assert len(indexes) == 4
    assert indexes == [0, 1, 2, 3]


def test_random_indexes_skips_values_outside_range(monkeypatch):
    def fake_token_bytes(count: int) -> bytes:
        return bytes([255, 10, 11, 12])

    monkeypatch.setattr(_events, "ALPHABET_SIZE", 255)
    monkeypatch.setattr(secrets, "token_bytes", fake_token_bytes)

    indexes = _events._random_indexes(3)

    assert indexes == [10, 11, 12]


def test_generate_code_and_validate_round_trip(monkeypatch):
    sequence = [0, 1, 2, 3, 4, 5]
    monkeypatch.setattr(
        _events,
        "_random_indexes",
        lambda count: sequence[:count],
    )

    code = _events.generate_code()

    assert len(code) == 7
    assert _events.validate_code(code)
    assert not _events.validate_code(code[:-1] + "A")


def test_validate_code_rejects_invalid_inputs():
    assert not _events.validate_code("SHORT")
    assert not _events.validate_code(12345)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "value, expected",
    [
        (None, None),
        (float("nan"), None),
        (1_700_000_000_123, 1_700_000_000.123),
        ("   ", None),
        ("not-a-date", None),
    ],
)
def test_parse_timestamp_edge_cases(value, expected):
    result = _events._parse_timestamp(value)
    if expected is None:
        assert result is None or (isinstance(result, float) and math.isnan(result))
    else:
        assert result == pytest.approx(expected, rel=0, abs=1e-6)


def test_parse_timestamp_converts_strings(monkeypatch):
    naive = _events._parse_timestamp("2024-01-02T03:04:05")
    zoned = _events._parse_timestamp("2024-01-02T03:04:05Z")

    assert naive is not None
    assert zoned is not None
    assert naive == pytest.approx(zoned, rel=0, abs=1e-6)


def test_parse_timestamp_returns_none_for_unknown_type():
    class Dummy:
        pass

    assert _events._parse_timestamp(Dummy()) is None


@pytest.mark.parametrize(
    "value, expected",
    [
        (None, None),
        (True, 1),
        (3.14, 3),
        ("42", 42),
        ("bad", None),
    ],
)
def test_to_int_handles_varied_input(value, expected):
    assert _events._to_int(value) == expected


@pytest.mark.parametrize(
    "value, expected",
    [
        (None, None),
        (False, 0.0),
        (7, 7.0),
        ("8.5", 8.5),
        ("oops", None),
    ],
)
def test_to_float_handles_varied_input(value, expected):
    result = _events._to_float(value)
    if expected is None:
        assert result is None
    else:
        assert result == pytest.approx(expected, rel=0, abs=1e-6)


def test_format_timestamp_handles_none():
    assert _events._format_timestamp(None) is None


def test_build_board_sorts_players_and_formats_timestamp():
    rows: list[Mapping[str, object]] = [
        {
            "name": "Player B",
            "gross": 70,
            "net": 2.0,
            "thru": 10,
            "hole": 11,
            "status": "playing",
            "updated_at": "2024-01-01T00:00:03Z",
            "last_under_par_at": "2024-01-01T00:00:01Z",
            "finished_at": "2024-01-01T02:00:00Z",
        },
        {
            "display_name": "Player A",
            "gross": 68,
            "net": 1.0,
            "holes": 12,
            "current_hole": 13,
            "state": "finished",
            "last_updated": 1_700_000_000.0,
            "under_par_at": 1_699_999_900_000,
            "completed_at": "2024-01-01T01:00:00",
        },
        {
            "name": "Player C",
            "gross": 74,
            "net": None,
            "holes_played": 9,
            "hole": None,
            "status": "",
        },
    ]

    players, updated_at = _events.build_board(rows)

    assert [player.name for player in players] == ["Player A", "Player B", "Player C"]
    assert isinstance(updated_at, str)
    parsed = datetime.fromisoformat(updated_at)
    assert parsed.tzinfo == timezone.utc


def test_build_board_with_no_rows_returns_empty():
    players, updated_at = _events.build_board([])
    assert players == []
    assert updated_at is None
