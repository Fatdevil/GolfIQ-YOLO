import pytest

from server.services.caddie_core import engine


def test_compute_dispersion_by_club_returns_stats_for_each_club():
    shot_samples = [
        {"club": "7i", "carry_m": 150.0, "lateral_m": -2.0},
        {"club": "7i", "carry_m": 153.0, "lateral_m": 1.0},
        {"club": "7i", "carry_m": 147.0, "lateral_m": 0.0},
        {"club": "PW", "carry_m": 125.0, "lateral_m": -1.5},
        {"club": "PW", "carry_m": 129.0, "lateral_m": 0.5},
        {"club": "PW", "carry_m": 123.0, "lateral_m": -0.5},
    ]

    dispersion = engine.compute_dispersion_by_club(shot_samples)

    assert set(dispersion.keys()) == {"7i", "PW"}
    seven_iron = dispersion["7i"]
    pitching_wedge = dispersion["PW"]

    assert seven_iron["count"] == 3
    assert seven_iron["carry_mean"] == pytest.approx(150.0, rel=1e-6)
    assert seven_iron["carry_std"] == pytest.approx(3.0, rel=1e-6)
    assert seven_iron["lateral_std"] == pytest.approx(1.528, rel=1e-3)

    assert pitching_wedge["count"] == 3
    assert pitching_wedge["carry_mean"] == pytest.approx(125.6667, rel=1e-3)
    assert pitching_wedge["carry_std"] == pytest.approx(3.055, rel=1e-3)
    assert pitching_wedge["lateral_std"] == pytest.approx(1.0, rel=1e-3)


def test_compute_dispersion_by_club_requires_minimum_samples():
    shot_samples = [
        {"club": "7i", "carry_m": 150.0, "lateral_m": -2.0},
    ]

    with pytest.raises(ValueError):
        engine.compute_dispersion_by_club(shot_samples, minimum_samples=2)
def test_wind_effect_returns_carry_and_lateral_adjustments():
    effect = engine.wind_effect(speed_mps=4.0, direction_deg=0)

    assert effect["carry_delta_m"] == pytest.approx(6.0)
    assert effect["lateral_margin_m"] == pytest.approx(0.0)

    tailwind = engine.wind_effect(speed_mps=4.0, direction_deg=180)
    assert tailwind["carry_delta_m"] == pytest.approx(-4.8)
    assert tailwind["lateral_margin_m"] == pytest.approx(0.0)

    crosswind = engine.wind_effect(speed_mps=4.0, direction_deg=90)
    assert crosswind["carry_delta_m"] == pytest.approx(0.0)
    assert crosswind["lateral_margin_m"] == pytest.approx(2.0)


def test_wind_effect_normalizes_negative_angles():
    effect = engine.wind_effect(speed_mps=2.0, direction_deg=-20)

    # -20 degrees is equivalent to 340 (tailwind with slight cross)
    assert effect["carry_delta_m"] == pytest.approx(-2.4, rel=1e-6)
    assert effect["lateral_margin_m"] == pytest.approx(0.342, rel=1e-3)


def test_elevation_effect_scales_with_height_delta():
    uphill = engine.elevation_effect(delta_m=3.0)
    downhill = engine.elevation_effect(delta_m=-2.0)

    assert uphill == pytest.approx(2.4)
    assert downhill == pytest.approx(-1.6)
def test_choose_club_returns_primary_when_margin_safe():
    aggregates = {
        "7i": {"count": 210, "carry_mean": 152.0, "carry_std": 7.5, "lateral_std": 3.0},
        "8i": {"count": 205, "carry_mean": 140.0, "carry_std": 6.0, "lateral_std": 2.5},
    }

    result = engine.choose_club(
        target_distance_m=148.0,
        aggregates=aggregates,
        hazard_distance_m=None,
        lie_type="fairway",
        k_sigma_primary=1.0,
        k_sigma_conservative=1.5,
        hazard_buffer_m=5.0,
    )

    assert result["club"] == "7i"
    assert result["conservative_club"] is None
    assert result["confidence"] == "high"
    assert result["hazard_flag"] is False
    assert result["safety_margin_m"] == pytest.approx(12.5, rel=1e-6)


def test_choose_club_returns_conservative_when_hazard_requires_buffer():
    aggregates = {
        "7i": {"count": 150, "carry_mean": 152.0, "carry_std": 9.0, "lateral_std": 3.0},
        "8i": {"count": 200, "carry_mean": 140.0, "carry_std": 6.0, "lateral_std": 2.5},
        "6i": {"count": 160, "carry_mean": 162.0, "carry_std": 9.5, "lateral_std": 3.5},
    }

    result = engine.choose_club(
        target_distance_m=150.0,
        aggregates=aggregates,
        hazard_distance_m=151.0,
        lie_type="rough",
        k_sigma_primary=1.0,
        k_sigma_conservative=1.5,
        hazard_buffer_m=5.0,
    )

    assert result["club"] == "7i"
    assert result["conservative_club"] == "8i"
    assert result["hazard_flag"] is True
    assert result["confidence"] == "medium"
    assert result["safety_margin_m"] > 0


def test_choose_club_forces_conservative_when_confidence_low():
    aggregates = {
        "7i": {"count": 80, "carry_mean": 150.0, "carry_std": 16.0, "lateral_std": 4.0},
        "8i": {"count": 75, "carry_mean": 140.0, "carry_std": 15.5, "lateral_std": 3.8},
    }

    result = engine.choose_club(
        target_distance_m=145.0,
        aggregates=aggregates,
        hazard_distance_m=None,
        lie_type="fairway",
        k_sigma_primary=1.0,
        k_sigma_conservative=1.5,
        hazard_buffer_m=5.0,
    )

    assert result["confidence"] == "low"
    assert result["conservative_club"] == "8i"


