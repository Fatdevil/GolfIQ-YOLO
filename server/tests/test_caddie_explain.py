import pytest

from server.services.caddie_core import explain


def test_build_explain_score_returns_top_three_normalized_factors():
    factors = {
        "target_gap": 12.0,
        "wind_effect": -8.0,
        "elevation_effect": 3.0,
        "lie_penalty": 5.0,
        "dispersion_margin": 10.0,
    }

    score = explain.build_explain_score(factors)

    assert len(score) == 3
    names = [item["name"] for item in score]
    assert set(names).issubset({"target_gap", "wind_effect", "dispersion_margin", "lie_penalty"})
    assert score[0]["weight"] + score[1]["weight"] + score[2]["weight"] == pytest.approx(1.0)
    assert score[0]["weight"] >= score[1]["weight"] >= score[2]["weight"]


def test_build_explain_score_preserves_direction_signs():
    factors = {
        "target_gap": 5.0,
        "wind_effect": -2.0,
        "elevation_effect": -4.0,
        "lie_penalty": 1.0,
        "dispersion_margin": 0.5,
    }

    score = explain.build_explain_score(factors)

    for item in score:
        if item["name"] in ("wind_effect", "elevation_effect"):
            assert item["direction"] == "negative"
        else:
            assert item["direction"] == "positive"


def test_build_explain_score_handles_zero_sum_factors():
    factors = {
        "target_gap": 0.0,
        "wind_effect": 0.0,
        "elevation_effect": 0.0,
    }

    score = explain.build_explain_score(factors)

    assert all(item["weight"] == 0.0 for item in score)
