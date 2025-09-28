from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass
class Suggestion:
    club: str
    conservative_club: str
    reasoning: list[str]
    confidence: str


class CaddieCoreClient:
    def __init__(self) -> None:
        self._cache: Dict[str, Suggestion] = {}

    def get_targets(self, hole_id: str) -> Dict[str, object]:
        return {
            "hole_id": hole_id,
            "pin_gps": {"lat": 33.6405, "lon": -117.8443},
            "layups": [
                {"id": "layup-200", "name": "Safe 200m", "lat": 33.6399, "lon": -117.8450},
                {"id": "layup-150", "name": "Aggressive 150m", "lat": 33.6402, "lon": -117.8446},
            ],
        }

    def suggest(self, lie: str, distance_m: float) -> Suggestion:
        key = f"{lie}:{distance_m:.1f}"
        if key in self._cache:
            return self._cache[key]
        suggestion = Suggestion(
            club="7i",
            conservative_club="6i",
            reasoning=["wind_breeze_2mps_cross"],
            confidence="medium",
        )
        self._cache[key] = suggestion
        return suggestion