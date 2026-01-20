from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import numpy as np

from cv_engine.metrics.kinematics import CalibrationParams
from cv_engine.pipeline.analyze import analyze_frames

DEMO_ASSETS = REPO_ROOT / "demo_assets"
CASE_DIR = DEMO_ASSETS / "cases"
GOLDEN_DIR = DEMO_ASSETS / "golden"
DEFAULT_OUT_DIR = REPO_ROOT / "demo_out"


def load_case(case_id: str) -> dict[str, Any]:
    path = CASE_DIR / f"{case_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Unknown demo case: {case_id}")
    return json.loads(path.read_text())


def load_golden(case_id: str) -> dict[str, Any]:
    path = GOLDEN_DIR / f"{case_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing golden output for case: {case_id}")
    return json.loads(path.read_text())


def _build_frame(pattern: dict[str, Any], width: int, height: int) -> np.ndarray:
    pattern_type = pattern.get("type")
    if pattern_type == "checkerboard":
        low = int(pattern.get("low", 0))
        high = int(pattern.get("high", 255))
        mask = (np.indices((height, width)).sum(axis=0) % 2).astype(np.uint8)
        base = (mask * (high - low) + low).astype(np.uint8)
    elif pattern_type == "solid":
        value = int(pattern.get("value", 0))
        base = np.full((height, width), value, dtype=np.uint8)
    else:
        raise ValueError(f"Unsupported pattern type: {pattern_type}")
    return np.stack([base, base, base], axis=-1)


def build_frames(case: dict[str, Any]) -> list[np.ndarray]:
    width = int(case.get("width", 64))
    height = int(case.get("height", 64))
    frame_count = int(case.get("frame_count", 8))
    pattern = case.get("pattern", {"type": "solid", "value": 0})
    frame = _build_frame(pattern, width=width, height=height)
    return [frame.copy() for _ in range(frame_count)]


def _normalize_metrics(metrics: dict[str, Any]) -> dict[str, Any]:
    normalized = json.loads(json.dumps(metrics))
    inference = normalized.get("inference")
    if isinstance(inference, dict):
        inference["totalInferenceMs"] = 0.0
        inference["avgInferenceMs"] = 0.0
    return normalized


def _coerce_dataclass(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    return value


def _compare_values(
    actual: Any,
    expected: Any,
    path: str,
    *,
    rel_tol: float = 1e-3,
    abs_tol: float = 1e-3,
) -> tuple[bool, str | None]:
    actual = _coerce_dataclass(actual)
    expected = _coerce_dataclass(expected)

    if isinstance(expected, dict) and isinstance(actual, dict):
        expected_keys = set(expected.keys())
        actual_keys = set(actual.keys())
        if expected_keys != actual_keys:
            missing = sorted(expected_keys - actual_keys)
            extra = sorted(actual_keys - expected_keys)
            return (
                False,
                f"{path or 'root'} keys differ: missing={missing}, extra={extra}",
            )
        for key in sorted(expected_keys):
            ok, message = _compare_values(
                actual[key],
                expected[key],
                f"{path}.{key}" if path else key,
                rel_tol=rel_tol,
                abs_tol=abs_tol,
            )
            if not ok:
                return ok, message
        return True, None

    if isinstance(expected, list) and isinstance(actual, list):
        if len(actual) != len(expected):
            return (
                False,
                f"{path or 'root'} length differs: {len(actual)} != {len(expected)}",
            )
        for idx, (act_item, exp_item) in enumerate(zip(actual, expected)):
            ok, message = _compare_values(
                act_item,
                exp_item,
                f"{path}[{idx}]" if path else f"[{idx}]",
                rel_tol=rel_tol,
                abs_tol=abs_tol,
            )
            if not ok:
                return ok, message
        return True, None

    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        if isinstance(expected, bool) or isinstance(actual, bool):
            return (
                expected == actual,
                None if expected == actual else f"{path} bool differs",
            )
        if math.isclose(
            float(actual), float(expected), rel_tol=rel_tol, abs_tol=abs_tol
        ):
            return True, None
        return (
            False,
            f"{path or 'root'} differs: {actual} != {expected}",
        )

    if actual != expected:
        return False, f"{path or 'root'} differs: {actual} != {expected}"

    return True, None


def verify_metrics(case_id: str, metrics: dict[str, Any]) -> None:
    expected = load_golden(case_id)
    ok, message = _compare_values(metrics, expected, "")
    if not ok:
        raise AssertionError(message)


def summarize(metrics: dict[str, Any]) -> str:
    hud = (
        metrics.get("capture_quality", {}).get("range_mode_hud")
        or metrics.get("range_mode_hud")
        or {}
    )
    state = "unknown"
    if isinstance(hud, dict):
        state = str(hud.get("state", "unknown"))
    confidence = (
        metrics.get("explain_result", {}).get("confidence", {}).get("label", "unknown")
    )
    tips = metrics.get("micro_coach", {}).get("tips", [])
    return f"HUD={state} confidence={confidence} tips={len(tips)}"


def run_demo_case(
    case_id: str,
    *,
    out_path: Path | None = None,
    verify: bool = False,
) -> dict[str, Any]:
    case = load_case(case_id)
    frames = build_frames(case)
    calib = CalibrationParams(
        m_per_px=float(case.get("m_per_px", 0.001)),
        fps=float(case.get("fps", 240.0)),
    )
    result = analyze_frames(frames, calib, mock=True, smoothing_window=1)
    metrics = _normalize_metrics(result["metrics"])

    if out_path is None:
        out_path = DEFAULT_OUT_DIR / f"{case_id}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(metrics, indent=2, sort_keys=True))

    if verify:
        verify_metrics(case_id, metrics)

    return metrics


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run offline demo cases.")
    parser.add_argument("--case", dest="case_id", required=True)
    parser.add_argument(
        "--out",
        dest="out",
        default=None,
        help="Output path (default: demo_out/<case_id>.json)",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Compare output to demo_assets/golden/<case_id>.json",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    out_path = Path(args.out) if args.out else None
    try:
        metrics = run_demo_case(args.case_id, out_path=out_path, verify=args.verify)
    except (AssertionError, FileNotFoundError, ValueError) as exc:
        print(f"Demo case failed: {exc}")
        return 1

    summary = summarize(metrics)
    print(f"Demo case '{args.case_id}': {summary}")
    if args.verify:
        print(f"Verified against {GOLDEN_DIR / f'{args.case_id}.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
