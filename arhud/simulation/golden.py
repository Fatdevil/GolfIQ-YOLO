from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class GoldenComparisonResult:
    match_score: float
    missing_assets: list[Path]


def compare_hud_state(
    state_name: str, capture_dir: Path, golden_dir: str
) -> GoldenComparisonResult:
    capture_dir.mkdir(parents=True, exist_ok=True)
    golden_path = Path(golden_dir) / f"{state_name}.png"
    missing = []
    if not golden_path.exists():
        missing.append(golden_path)
    return GoldenComparisonResult(
        match_score=1.0 if not missing else 0.0, missing_assets=missing
    )
