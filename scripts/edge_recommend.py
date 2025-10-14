from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from statistics import median
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RUNS_PATH = REPO_ROOT / "data" / "bench" / "edge_runs.jsonl"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "models" / "edge_defaults.json"
DEFAULT_RECENT = 200


@dataclass(frozen=True)
class EdgeRun:
    platform: str
    runtime: str
    input_size: int
    quant: str
    threads: int
    delegate: Optional[str]
    fps: Optional[float]
    p95: Optional[float]
    battery_delta: Optional[float]

    @staticmethod
    def from_json(data: Dict[str, object]) -> "EdgeRun | None":
        try:
            if _is_truthy(data.get("dryRun")):
                return None
            platform = str(data.get("platform", "")).strip().lower()
            runtime = str(data.get("runtime", "")).strip().lower()
            quant = str(data.get("quant", "")).strip().lower()
            delegate_raw = data.get("delegate")
            delegate = None
            if isinstance(delegate_raw, str) and delegate_raw.strip():
                delegate = delegate_raw.strip().lower()
            threads = int(data.get("threads", 0))
            input_size = int(data.get("inputSize", data.get("input_size", 0)))

            fps = _coerce_float(data.get("fpsAvg", data.get("fps")))
            p95 = _coerce_float(data.get("p95", data.get("p95Latency")))
            battery = _coerce_float(data.get("batteryDelta", data.get("battery")))
        except (TypeError, ValueError):
            return None

        return EdgeRun(
            platform=platform,
            runtime=runtime,
            input_size=input_size,
            quant=quant,
            threads=threads,
            delegate=delegate,
            fps=fps,
            p95=p95,
            battery_delta=battery,
        )


def _coerce_float(value: object | None) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _is_truthy(value: object | None) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        return normalized in {"1", "true", "yes", "y"}
    return False


def load_recent_runs(
    path: Path = DEFAULT_RUNS_PATH, limit: int = DEFAULT_RECENT
) -> List[EdgeRun]:
    if limit <= 0:
        limit = DEFAULT_RECENT

    if not path.exists():
        return []

    runs: List[EdgeRun] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            run = EdgeRun.from_json(payload)
            if run is None:
                continue
            runs.append(run)

    if limit and len(runs) > limit:
        runs = runs[-limit:]

    return runs


def _median(values: Sequence[float]) -> float:
    if not values:
        raise ValueError("median requires non-empty sequence")
    return float(median(values))


def _score_key(
    runtime: str,
    input_size: int,
    quant: str,
    threads: int,
    delegate: Optional[str],
    p95: Optional[float],
    fps: Optional[float],
    battery: Optional[float],
) -> Tuple[float, float, float, str, int, str, int, str]:
    worst_latency = float("inf")
    worst_fps = -float("inf")
    worst_battery = float("inf")

    latency_score = p95 if p95 is not None else worst_latency
    fps_score = -(fps if fps is not None else 0.0)
    battery_score = abs(battery) if battery is not None else worst_battery

    return (
        latency_score,
        fps_score,
        battery_score,
        runtime,
        input_size,
        quant,
        threads,
        delegate or "",
    )


def compute_recommendations(runs: Iterable[EdgeRun]) -> Dict[str, Dict[str, object]]:
    grouped: Dict[
        str, Dict[Tuple[str, int, str, int, Optional[str]], Dict[str, List[float]]]
    ] = {}

    for run in runs:
        if run.platform not in {"android", "ios"}:
            continue
        if run.input_size <= 0 or run.threads <= 0 or not run.runtime or not run.quant:
            continue
        key = (run.runtime, run.input_size, run.quant, run.threads, run.delegate)
        platform_bucket = grouped.setdefault(run.platform, {})
        bucket = platform_bucket.setdefault(key, {"p95": [], "fps": [], "battery": []})
        if run.p95 is not None:
            bucket["p95"].append(run.p95)
        if run.fps is not None:
            bucket["fps"].append(run.fps)
        if run.battery_delta is not None:
            bucket["battery"].append(run.battery_delta)

    recommendations: Dict[str, Dict[str, object]] = {}

    for platform, platform_bucket in grouped.items():
        best_choice: Tuple[float, float, float, str, int, str, int, str] | None = None
        best_config: Dict[str, object] | None = None

        for (
            runtime,
            input_size,
            quant,
            threads,
            delegate,
        ), stats in platform_bucket.items():
            if not stats["p95"] or not stats["fps"]:
                continue
            p95_value = _median(stats["p95"])
            fps_value = _median(stats["fps"])
            battery_value = _median(stats["battery"]) if stats["battery"] else None
            candidate_key = _score_key(
                runtime,
                input_size,
                quant,
                threads,
                delegate,
                p95_value,
                fps_value,
                battery_value,
            )
            if best_choice is None or candidate_key < best_choice:
                best_choice = candidate_key
                config: Dict[str, object] = {
                    "runtime": runtime,
                    "inputSize": input_size,
                    "quant": quant,
                    "threads": threads,
                }
                if delegate:
                    config["delegate"] = delegate
                best_config = config

        if best_choice and best_config:
            recommendations[platform] = best_config

    return recommendations


def write_defaults(
    defaults: Dict[str, Dict[str, object]], dest: Path = DEFAULT_OUTPUT_PATH
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", encoding="utf-8") as handle:
        json.dump(defaults, handle, indent=2, sort_keys=True)
        handle.write("\n")


def recommend_defaults(
    runs_path: Path = DEFAULT_RUNS_PATH,
    output_path: Path = DEFAULT_OUTPUT_PATH,
    recent: int = DEFAULT_RECENT,
) -> Dict[str, Dict[str, object]]:
    runs = load_recent_runs(runs_path, recent)
    defaults = compute_recommendations(runs)
    write_defaults(defaults, output_path)
    return defaults


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Aggregate edge bench runs and recommend defaults"
    )
    parser.add_argument(
        "--runs",
        type=Path,
        default=DEFAULT_RUNS_PATH,
        help="Path to edge_runs.jsonl",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Where to write edge_defaults.json",
    )
    parser.add_argument(
        "--recent",
        type=int,
        default=DEFAULT_RECENT,
        help="Number of recent runs to consider",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> None:
    args = _parse_args(argv)
    defaults = recommend_defaults(args.runs, args.output, args.recent)
    print(json.dumps(defaults, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
