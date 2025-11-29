from __future__ import annotations

from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from server.services.tour_reference import compare_to_bands
from server.storage.runs import RunRecord, load_run


class MetricValue(BaseModel):
    value: float
    units: str


class TourCompare(BaseModel):
    band_group: str
    status: str
    range_min: float
    range_max: float


class SwingMetricsResponse(BaseModel):
    run_id: str
    club: Optional[str] = None
    metrics: Dict[str, MetricValue]
    tour_compare: Dict[str, TourCompare] = {}


router = APIRouter()


def _coerce_float(value: object) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _add_metric(
    out: Dict[str, MetricValue], key: str, value: object, units: str
) -> None:
    numeric = _coerce_float(value)
    if numeric is None:
        return
    out[key] = MetricValue(value=numeric, units=units)


def _collect_metrics(run: RunRecord) -> dict[str, MetricValue]:
    metrics: dict[str, MetricValue] = {}

    seq = run.metrics.get("sequence") if isinstance(run.metrics, dict) else None
    if isinstance(seq, dict):
        _add_metric(
            metrics, "max_shoulder_rotation", seq.get("max_shoulder_rotation"), "deg"
        )
        _add_metric(metrics, "max_hip_rotation", seq.get("max_hip_rotation"), "deg")
        _add_metric(metrics, "max_x_factor", seq.get("max_x_factor"), "deg")

    faceon = run.metrics.get("faceon") if isinstance(run.metrics, dict) else None
    if isinstance(faceon, dict):
        _add_metric(metrics, "sway_px", faceon.get("sway_px"), "px")
        _add_metric(metrics, "sway_cm", faceon.get("sway_cm"), "cm")
        _add_metric(
            metrics, "shoulder_tilt_deg", faceon.get("shoulder_tilt_deg"), "deg"
        )
        _add_metric(metrics, "shaft_lean_deg", faceon.get("shaft_lean_deg"), "deg")

    top_level = run.metrics if isinstance(run.metrics, dict) else {}
    _add_metric(metrics, "launch_deg", top_level.get("launch_deg"), "deg")
    _add_metric(metrics, "sideAngleDeg", top_level.get("sideAngleDeg"), "deg")
    _add_metric(metrics, "carry_m", top_level.get("carry_m"), "m")

    return metrics


def _collect_tour_compare(
    metrics: Dict[str, MetricValue], club: Optional[str]
) -> Dict[str, TourCompare]:
    results: Dict[str, TourCompare] = {}
    for name, metric in metrics.items():
        comparison = compare_to_bands(name, metric.value, club)
        if comparison is None:
            continue
        results[name] = TourCompare(**comparison)
    return results


@router.get("/api/swing/{run_id}/metrics", response_model=SwingMetricsResponse)
def swing_metrics(run_id: str) -> SwingMetricsResponse:
    run = load_run(run_id)
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="run not found"
        )

    metrics = _collect_metrics(run)
    club = run.params.get("club") if isinstance(run.params, dict) else None
    tour_compare = _collect_tour_compare(metrics, club)

    return SwingMetricsResponse(
        run_id=run.run_id,
        club=club,
        metrics=metrics,
        tour_compare=tour_compare,
    )


__all__ = ["router", "swing_metrics"]
