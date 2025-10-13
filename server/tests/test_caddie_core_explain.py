from __future__ import annotations

from server.services.caddie_core import explain


def test_build_explain_score_filters_whitelist() -> None:
    result = explain.build_explain_score({"unknown": 5.0})
    assert result == []


def test_build_explain_score_handles_zero_total() -> None:
    values = {"target_gap": 0.0, "wind_effect": 0.0}
    result = explain.build_explain_score(values)
    assert all(item["weight"] == 0.0 for item in result)
    assert all(item["direction"] == "positive" for item in result)


def test_build_explain_score_normalizes_weights() -> None:
    values = {"target_gap": 2.0, "wind_effect": -1.0, "lie_penalty": 0.5}
    result = explain.build_explain_score(values)
    names = {item["name"] for item in result}
    assert names == {"target_gap", "wind_effect", "lie_penalty"}
    weights = {item["name"]: item["weight"] for item in result}
    total = sum(weights.values())
    assert abs(total - 1.0) < 1e-6
    assert weights["target_gap"] > weights["wind_effect"]
    directions = {item["name"]: item["direction"] for item in result}
    assert directions["wind_effect"] == "negative"
    assert directions["target_gap"] == "positive"


def test_summarize_factor_names_extracts_names() -> None:
    payload = [{"name": "target_gap"}, {"name": "wind_effect"}]
    assert explain.summarize_factor_names(payload) == ["target_gap", "wind_effect"]
