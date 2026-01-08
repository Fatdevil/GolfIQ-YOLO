from __future__ import annotations

import argparse
import base64
import binascii
import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

REPO_ROOT = Path(__file__).resolve().parents[1]


def _import_cv_engine():
    if str(REPO_ROOT) not in sys.path:
        sys.path.append(str(REPO_ROOT))

    from cv_engine.io.framesource import frames_from_zip_bytes as _frames_from_zip_bytes
    from cv_engine.metrics.kinematics import CalibrationParams as _CalibrationParams
    from cv_engine.pipeline.analyze import analyze_frames as _analyze_frames

    return _frames_from_zip_bytes, _CalibrationParams, _analyze_frames


frames_from_zip_bytes, CalibrationParams, analyze_frames = _import_cv_engine()

MetricName = str


@dataclass
class MetricSample:
    clip_id: str
    expected: Optional[float]
    actual: Optional[float]

    @property
    def abs_error(self) -> Optional[float]:
        if self.expected is None or self.actual is None:
            return None
        return abs(self.actual - self.expected)

    @property
    def pct_error(self) -> Optional[float]:
        if self.expected is None or self.actual is None:
            return None
        if self.expected == 0:
            return None
        return abs(self.actual - self.expected) / abs(self.expected)


def percentile(values: List[float], q: float) -> float:
    if not values:
        raise ValueError("Cannot compute percentile of empty list")
    if q <= 0:
        return min(values)
    if q >= 1:
        return max(values)
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    lower = math.floor(pos)
    upper = math.ceil(pos)
    if lower == upper:
        return ordered[int(pos)]
    weight = pos - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def aggregate_metric(samples: Iterable[MetricSample]) -> Dict[str, Optional[float]]:
    abs_errors: List[float] = []
    pct_errors: List[float] = []
    missing = 0
    total = 0
    for sample in samples:
        total += 1
        err = sample.abs_error
        pct = sample.pct_error
        if err is None:
            missing += 1
        else:
            abs_errors.append(err)
        if pct is not None:
            pct_errors.append(pct)
    summary: Dict[str, Optional[float]] = {
        "count": float(total),
        "missing": float(missing),
        "mae": sum(abs_errors) / len(abs_errors) if abs_errors else None,
        "mape": sum(pct_errors) / len(pct_errors) if pct_errors else None,
        "p50": percentile(abs_errors, 0.5) if abs_errors else None,
        "p95": percentile(abs_errors, 0.95) if abs_errors else None,
        "max": max(abs_errors) if abs_errors else None,
    }
    return summary


def evaluate_clip(
    clip: Mapping[str, Any], dataset_root: Path, override_mock: Optional[bool] = None
) -> Dict[str, Any]:
    clip_id = clip["id"]
    file_path = dataset_root / clip["file"]
    if not file_path.exists():
        raise FileNotFoundError(f"Missing clip file: {file_path}")

    data = _read_clip_bytes(file_path)
    frames = frames_from_zip_bytes(data)

    calibration = clip.get("calibration") or {}
    ref_len_m = float(calibration.get("ref_len_m"))
    ref_len_px = float(calibration.get("ref_len_px"))
    fps = float(calibration.get("fps"))
    calib = CalibrationParams.from_reference(ref_len_m, ref_len_px, fps)

    motion_cfg = clip.get("motion")
    motion = None
    if motion_cfg:
        motion = (
            float(motion_cfg.get("ball_dx", 0.0)),
            float(motion_cfg.get("ball_dy", 0.0)),
            float(motion_cfg.get("club_dx", 0.0)),
            float(motion_cfg.get("club_dy", 0.0)),
        )

    mock = bool(clip.get("mock", False)) if override_mock is None else override_mock
    result = analyze_frames(frames, calib, mock=mock, motion=motion)
    metrics = result.get("metrics", {})
    actual_metrics = {
        "ballSpeed": _pick_number(
            metrics, ["ballSpeedMps", "ball_speed_mps", "ballSpeed", "ball_speed"]
        ),
        "sideAngle": _pick_number(
            metrics, ["sideAngleDeg", "side_angle", "sideAngle", "side"]
        ),
        "carry": _pick_number(metrics, ["carryEstM", "carry", "carry_m"]),
    }

    expected = clip.get("expected", {})
    clip_report = {
        "id": clip_id,
        "file": str(file_path.relative_to(dataset_root)),
        "expected": expected,
        "actual": actual_metrics,
        "errors": {
            metric: (
                abs(actual_metrics[metric] - expected.get(metric))
                if actual_metrics[metric] is not None
                and expected.get(metric) is not None
                else None
            )
            for metric in actual_metrics
        },
    }
    return clip_report


def _pick_number(source: Mapping[str, Any], keys: Iterable[str]) -> Optional[float]:
    for key in keys:
        value = source.get(key)
        if value is None:
            continue
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            return float(value)
        if isinstance(value, str):
            try:
                parsed = float(value)
            except ValueError:
                continue
            if math.isfinite(parsed):
                return parsed
    return None


def _read_clip_bytes(file_path: Path) -> bytes:
    if file_path.suffix == ".b64":
        text = file_path.read_text().strip()
        try:
            return base64.b64decode(text)
        except binascii.Error as exc:
            raise ValueError(f"Invalid base64 data in {file_path}") from exc
    return file_path.read_bytes()


def merge_thresholds(
    base: Mapping[str, Any], override: Optional[Mapping[str, Any]]
) -> Dict[str, Dict[str, float]]:
    merged: Dict[str, Dict[str, float]] = {
        metric: {k: float(v) for k, v in values.items()}
        for metric, values in base.items()
    }
    if override:
        for metric, values in override.items():
            merged.setdefault(metric, {})
            for key, value in values.items():
                merged[metric][key] = float(value)
    return merged


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate analyzer accuracy against a golden dataset"
    )
    parser.add_argument(
        "--dataset", type=Path, default=Path("data/golden"), help="Path to dataset root"
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("reports/accuracy.json"),
        help="Path to write evaluation report",
    )
    parser.add_argument(
        "--thresholds",
        type=Path,
        default=None,
        help="Optional JSON file overriding pass/fail thresholds",
    )
    parser.add_argument(
        "--mock",
        choices=["auto", "on", "off"],
        default="auto",
        help="Override mock mode (default: use clip metadata)",
    )
    parser.add_argument(
        "--fail-on-missing",
        action="store_true",
        help="Fail the run if any metric is missing",
    )

    args = parser.parse_args()
    dataset_root = args.dataset
    metadata_path = dataset_root / "metadata.json"
    if not metadata_path.exists():
        raise SystemExit(f"No metadata.json found at {metadata_path}")

    metadata = json.loads(metadata_path.read_text())
    clips = metadata.get("clips", [])
    if not clips:
        raise SystemExit("Dataset metadata has no clips")

    overrides = None
    if args.thresholds:
        overrides = json.loads(args.thresholds.read_text())

    thresholds = merge_thresholds(metadata.get("thresholds", {}), overrides)

    mock_override: Optional[bool]
    if args.mock == "on":
        mock_override = True
    elif args.mock == "off":
        mock_override = False
    else:
        mock_override = None

    clip_reports: List[Dict[str, Any]] = []
    metric_samples: Dict[MetricName, List[MetricSample]] = {
        "ballSpeed": [],
        "sideAngle": [],
        "carry": [],
    }

    for clip in clips:
        clip_report = evaluate_clip(clip, dataset_root, mock_override)
        clip_reports.append(clip_report)
        for metric, samples in metric_samples.items():
            samples.append(
                MetricSample(
                    clip_id=clip_report["id"],
                    expected=clip_report["expected"].get(metric),
                    actual=clip_report["actual"].get(metric),
                )
            )

    metrics_summary: Dict[str, Any] = {}
    gate_pass = True
    missing_values_detected = False

    for metric, samples in metric_samples.items():
        summary = aggregate_metric(samples)
        metrics_summary[metric] = summary
        metric_thresholds = thresholds.get(metric, {})
        checks: Dict[str, Any] = {}
        metric_pass = True
        for key, limit in metric_thresholds.items():
            stat_value = summary.get(key)
            if stat_value is None:
                metric_pass = False
                checks[key] = {"value": stat_value, "limit": limit, "pass": False}
                missing_values_detected = True
                continue
            passed = float(stat_value) <= float(limit)
            checks[key] = {"value": stat_value, "limit": limit, "pass": passed}
            metric_pass = metric_pass and passed
        if args.fail_on_missing and summary.get("missing"):
            metric_pass = False
        metrics_summary[metric] = summary | {"checks": checks, "pass": metric_pass}
        gate_pass = gate_pass and metric_pass

    report = {
        "dataset": str(dataset_root),
        "version": metadata.get("version"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "thresholds": thresholds,
        "metrics": metrics_summary,
        "clips": clip_reports,
        "passed": bool(gate_pass),
        "missingValuesDetected": missing_values_detected,
    }

    out_path = args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2))

    if not gate_pass:
        _print_regression_summary(report)
        print("Accuracy regression detected — see", out_path)
        return 1

    print("Accuracy check passed — see", out_path)
    return 0


def _print_regression_summary(report: Mapping[str, Any]) -> None:
    metrics = report.get("metrics", {})
    clips = report.get("clips", [])
    sys.stderr.write("Accuracy regression summary:\n")
    for metric, summary in metrics.items():
        if not summary.get("pass", True):
            sys.stderr.write(
                f"- {metric}: mae={summary.get('mae')} "
                f"p95={summary.get('p95')} mape={summary.get('mape')}\n"
            )

    for metric in ("ballSpeed", "sideAngle", "carry"):
        errors = []
        for clip in clips:
            expected = clip.get("expected", {}).get(metric)
            actual = clip.get("actual", {}).get(metric)
            error = clip.get("errors", {}).get(metric)
            if error is None:
                continue
            errors.append((abs(error), clip.get("id"), expected, actual))
        if not errors:
            continue
        errors.sort(reverse=True)
        sys.stderr.write(f"Top {metric} deltas:\n")
        for delta, clip_id, expected, actual in errors[:5]:
            sys.stderr.write(
                f"  - {clip_id}: expected={expected} actual={actual} "
                f"abs_error={delta}\n"
            )


if __name__ == "__main__":
    raise SystemExit(main())
