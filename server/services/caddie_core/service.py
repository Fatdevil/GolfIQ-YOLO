"""Service orchestration for CaddieCore."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Tuple

from . import engine, explain
from .models import (
    Confidence,
    Recommendation,
    RecommendationPayload,
    RecommendationResponse,
    ShotSample,
)
from .telemetry import build_structured_log_payload

Z_P80 = 0.8416212335729143


def _serialise_shot(sample: ShotSample) -> dict[str, object]:
    return {
        "club": sample.club,
        "carry_m": sample.carry_m,
        "lateral_m": sample.lateral_m,
    }


def recommend(payload: RecommendationPayload) -> Tuple[RecommendationResponse, dict]:
    sample_maps = [_serialise_shot(sample) for sample in payload.shot_samples]
    aggregates = engine.compute_dispersion_by_club(sample_maps, minimum_samples=1)

    wind = engine.wind_effect(
        payload.target.wind_speed_mps, payload.target.wind_direction_deg
    )
    elevation = engine.elevation_effect(payload.target.elevation_delta_m)
    lie_penalties = engine.lie_penalty(payload.target.lie_type, 0.0)

    effective_target = (
        payload.target.target_distance_m
        + wind["carry_delta_m"]
        + elevation
        + lie_penalties["distance"]
    )

    selection = engine.choose_club(
        target_distance_m=effective_target,
        aggregates=aggregates,
        hazard_distance_m=payload.target.hazard_distance_m,
        lie_type=payload.target.lie_type.value,
        k_sigma_primary=engine.DEFAULT_K_SIGMA_PRIMARY,
        k_sigma_conservative=engine.DEFAULT_K_SIGMA_CONSERVATIVE,
        hazard_buffer_m=engine.DEFAULT_HAZARD_BUFFER,
    )

    primary_stats = aggregates[selection["club"]]

    carry_p50 = primary_stats["carry_mean"]
    carry_p80 = carry_p50 + Z_P80 * primary_stats["carry_std"]

    recommendation = Recommendation(
        club=selection["club"],
        carry_p50_m=carry_p50,
        carry_p80_m=carry_p80,
        safety_margin_m=selection["safety_margin_m"],
        conservative_club=selection["conservative_club"],
        confidence=Confidence(selection["confidence"]),
        hazard_flag=selection["hazard_flag"],
    )

    factors = {
        "target_gap": carry_p50 - payload.target.target_distance_m,
        "wind_effect": wind["carry_delta_m"],
        "elevation_effect": elevation,
        "lie_penalty": lie_penalties["distance"],
        "dispersion_margin": selection["safety_margin_m"],
    }
    if payload.target.hazard_distance_m is not None:
        factors["hazard_margin"] = (
            payload.target.hazard_distance_m - payload.target.target_distance_m
        )

    explain_score = explain.build_explain_score(factors)

    telemetry_id = f"cad-{uuid.uuid4()}"
    generated_at = datetime.now(UTC)

    response = RecommendationResponse(
        recommendation=recommendation,
        explain_score=explain_score,
        telemetry_id=telemetry_id,
        generated_at=generated_at,
    )

    log_payload = build_structured_log_payload(
        telemetry_id=telemetry_id,
        recommendation=recommendation.model_dump(),
        explain_score=explain_score,
    )
    log_payload["scenario"] = payload.scenario.value

    return response, log_payload
