from __future__ import annotations

from server.caddie.playslike import plays_like


def test_headwind_tailwind_effects() -> None:
    base, _ = plays_like(150.0, 0.0, 0.0, 0.0, 20.0, 0.0)
    headwind, _ = plays_like(150.0, 5.0, 0.0, 0.0, 20.0, 0.0)
    tailwind, _ = plays_like(150.0, 5.0, 180.0, 0.0, 20.0, 0.0)
    assert headwind > base > tailwind


def test_temperature_shifts_distance() -> None:
    warm, _ = plays_like(150.0, 0.0, 0.0, 0.0, 30.0, 0.0)
    baseline, _ = plays_like(150.0, 0.0, 0.0, 0.0, 20.0, 0.0)
    cold, _ = plays_like(150.0, 0.0, 0.0, 0.0, 10.0, 0.0)
    assert cold > baseline > warm


def test_elevation_adjusts_distance() -> None:
    uphill, _ = plays_like(150.0, 0.0, 0.0, 0.0, 20.0, 10.0)
    baseline, _ = plays_like(150.0, 0.0, 0.0, 0.0, 20.0, 0.0)
    downhill, _ = plays_like(150.0, 0.0, 0.0, 0.0, 20.0, -10.0)
    assert uphill > baseline > downhill


def test_crosswind_does_not_change_distance() -> None:
    baseline, _ = plays_like(150.0, 0.0, 0.0, 0.0, 20.0, 0.0)
    crosswind, breakdown = plays_like(150.0, 5.0, 90.0, 0.0, 20.0, 0.0)
    assert crosswind == baseline
    assert breakdown["crosswind_mps"] != 0.0
