"""Explainability helpers for CaddieCore."""

from __future__ import annotations

from typing import Iterable

FACTOR_WHITELIST = {
    "target_gap",
    "wind_effect",
    "elevation_effect",
    "lie_penalty",
    "dispersion_margin",
    "hazard_margin",
}


def build_explain_score(factors: dict[str, float]) -> list[dict[str, object]]:
    """Return the top three factors with normalized weights."""
    filtered = {
        name: value for name, value in factors.items() if name in FACTOR_WHITELIST
    }
    if not filtered:
        return []

    ranked = sorted(
        filtered.items(),
        key=lambda item: abs(item[1]),
        reverse=True,
    )

    top = ranked[:3]
    total = sum(abs(value) for _, value in top)
    if total == 0:
        return [
            {
                "name": name,
                "weight": 0.0,
                "direction": "positive",
            }
            for name, _ in top
        ]

    explain = []
    for name, value in top:
        explain.append(
            {
                "name": name,
                "weight": abs(value) / total,
                "direction": "negative" if value < 0 else "positive",
            }
        )
    return explain


def summarize_factor_names(explain_score: Iterable[dict[str, object]]) -> list[str]:
    return [factor.get("name", "") for factor in explain_score]
