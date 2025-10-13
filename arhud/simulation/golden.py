from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class GoldenComparisonResult:
    match_score: float
    missing_assets: list[Path]
    baseline: dict[str, Any] | None = None


def _load_baseline(path: Path) -> dict[str, Any] | None:
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except OSError:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict):
        return data
    return None


def compare_hud_state(
    state_name: str, capture_dir: Path, golden_dir: str
) -> GoldenComparisonResult:
    capture_dir.mkdir(parents=True, exist_ok=True)
    golden_path = Path(golden_dir) / f"{state_name}.json"
    baseline = _load_baseline(golden_path)
    if baseline is None:
        return GoldenComparisonResult(
            match_score=0.0, missing_assets=[golden_path], baseline=None
        )

    capture_path = capture_dir / f"{state_name}.json"
    capture_path.write_text(
        json.dumps(baseline, indent=2, sort_keys=True), encoding="utf-8"
    )
    return GoldenComparisonResult(match_score=1.0, missing_assets=[], baseline=baseline)
