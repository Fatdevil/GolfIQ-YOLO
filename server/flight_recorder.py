from __future__ import annotations

import json
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

_rng = random.Random()


def should_record(pct: float) -> bool:
    """Return True when an event should be persisted based on the percentage."""

    if pct <= 0:
        return False
    if pct >= 100:
        return True
    return _rng.random() * 100 < pct


def record(event: Dict[str, Any], base_dir: Path) -> Path:
    """Append the event (as JSON) to the flight-recorder file for today."""

    base_dir.mkdir(parents=True, exist_ok=True)
    current_day = datetime.now(timezone.utc).date().isoformat()
    target = base_dir / f"flight-{current_day}.jsonl"
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, separators=(",", ":")))
        handle.write("\n")
    return target


__all__ = ["should_record", "record"]
