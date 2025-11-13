"""Shared pytest fixtures for server tests."""

from __future__ import annotations

import time as _real_time
from typing import Callable

import pytest


@pytest.fixture
def timewarp(monkeypatch: pytest.MonkeyPatch) -> Callable[[float], float]:
    """Advance time.time()/watch_devices._now_s without sleeping."""

    base = _real_time.time()
    offset = {"value": 0.0}

    def now() -> float:
        return base + offset["value"]

    def now_s() -> int:
        return int(now())

    def advance(seconds: float) -> float:
        offset["value"] += seconds
        return now()

    monkeypatch.setattr("time.time", now)
    monkeypatch.setattr("server.services.watch_devices._now_s", now_s)

    return advance
