from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, TypedDict


class TourBand(TypedDict):
    metric: str
    group: str
    range_min: float
    range_max: float
    club: str | None


class TourCompareResult(TypedDict):
    band_group: str
    status: str
    range_min: float
    range_max: float


_REFERENCE_PATH = (
    Path(__file__).resolve().parents[2] / "docs" / "ssot" / "tour_swing_reference.json"
)
_LOG = logging.getLogger(__name__)


def _load_reference_file(path: Path) -> list[TourBand]:
    try:
        data = json.loads(path.read_text()) if path.exists() else {}
        refs = data.get("references", []) if isinstance(data, dict) else []
        out: list[TourBand] = []
        for item in refs:
            if not isinstance(item, dict):
                continue
            metric = str(item.get("metric") or "").strip()
            if not metric:
                continue
            try:
                range_min = float(item.get("range_min"))
                range_max = float(item.get("range_max"))
            except (TypeError, ValueError):
                continue
            out.append(
                {
                    "metric": metric,
                    "group": str(item.get("group") or "unknown"),
                    "range_min": range_min,
                    "range_max": range_max,
                    "club": (str(item.get("club")) if item.get("club") else None),
                }
            )
        return out
    except Exception:
        _LOG.warning("failed to load tour_swing_reference.json", exc_info=True)
        return []


@lru_cache(maxsize=1)
def _reference_bands() -> list[TourBand]:
    return _load_reference_file(_REFERENCE_PATH)


def _reset_cache_for_tests() -> None:  # pragma: no cover - only for tests
    _reference_bands.cache_clear()


def get_reference_bands(metric: str, club: Optional[str] = None) -> List[TourBand]:
    metric_key = (metric or "").strip()
    if not metric_key:
        return []

    bands = [b for b in _reference_bands() if b.get("metric") == metric_key]
    if club:
        club_norm = club.lower()
        specific = [
            b for b in bands if b.get("club") and b["club"].lower() == club_norm
        ]
        if specific:
            return specific
    return bands


def compare_to_bands(
    metric: str, value: float, club: Optional[str] = None
) -> Optional[TourCompareResult]:
    if value is None:
        return None
    try:
        val = float(value)
    except (TypeError, ValueError):
        return None

    bands = get_reference_bands(metric, club)
    if not bands:
        return None

    band = bands[0]
    range_min = band.get("range_min")
    range_max = band.get("range_max")
    status = "in_range"
    if range_min is not None and val < range_min:
        status = "below"
    elif range_max is not None and val > range_max:
        status = "above"

    return {
        "band_group": str(band.get("group")),
        "status": status,
        "range_min": float(range_min),
        "range_max": float(range_max),
    }


__all__ = ["get_reference_bands", "compare_to_bands", "TourBand", "TourCompareResult"]
