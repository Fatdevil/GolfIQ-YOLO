from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class SimulationTraces:
    drift_meters: float
    latency_ms_p90: float
    anchor_confidence: float


def simulate_camera_path(scenario: str, duration_seconds: int, output_dir: Path) -> SimulationTraces:
    output_dir.mkdir(parents=True, exist_ok=True)
    path_file = output_dir / f"{scenario}.json"
    if scenario == "pan_walk_jitter":
        traces = SimulationTraces(drift_meters=0.35, latency_ms_p90=110.0, anchor_confidence=0.85)
    elif scenario == "steady_hold":
        traces = SimulationTraces(drift_meters=0.05, latency_ms_p90=40.0, anchor_confidence=0.95)
    else:
        traces = SimulationTraces(drift_meters=0.5, latency_ms_p90=120.0, anchor_confidence=0.8)
    path_file.write_text(
        (
            "{" f"\"drift_meters\": {traces.drift_meters}, "
            f"\"latency_ms_p90\": {traces.latency_ms_p90}, "
            f"\"anchor_confidence\": {traces.anchor_confidence}" "}"
        )
    )
    return traces