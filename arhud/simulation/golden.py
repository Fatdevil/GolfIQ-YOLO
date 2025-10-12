from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass
class GoldenComparisonResult:
    match_score: float
    missing_assets: list[Path]
    metadata: Dict[str, Any]


def compare_hud_state(
    state_name: str, capture_dir: Path, golden_dir: str
) -> GoldenComparisonResult:
    capture_dir.mkdir(parents=True, exist_ok=True)
    golden_path = Path(golden_dir) / f"{state_name}.json"
    metadata: Dict[str, Any] = {}
    missing = []
    if golden_path.exists():
        metadata = json.loads(golden_path.read_text(encoding="utf-8"))
        match_score = float(metadata.get("matchScore", 0.0))
    else:
        missing.append(golden_path)
        match_score = 0.0
    return GoldenComparisonResult(
        match_score=match_score, missing_assets=missing, metadata=metadata
    )
