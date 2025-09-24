#!/usr/bin/env python3
"""Seed demo aggregates for CaddieCore tests."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path


def compute_aggregates(samples: list[dict]) -> dict[str, dict[str, float]]:
    grouped: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: {"carry": [], "lateral": []}
    )
    for sample in samples:
        grouped[sample["club"]]["carry"].append(sample["carry_m"])
        grouped[sample["club"]]["lateral"].append(sample["lateral_m"])

    aggregates: dict[str, dict[str, float]] = {}
    for club, values in grouped.items():
        carries = values["carry"]
        lateral = values["lateral"]
        aggregates[club] = {
            "count": len(carries),
            "carry_mean": statistics.fmean(carries),
            "carry_std": statistics.pstdev(carries) if len(carries) > 1 else 0.0,
            "lateral_std": statistics.pstdev(lateral) if len(lateral) > 1 else 0.0,
        }
    return aggregates


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo aggregates for CaddieCore")
    parser.add_argument(
        "--input", required=True, type=Path, help="Path to raw shot samples JSON"
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("server/services/caddie_core/demo_aggregates.json"),
    )
    args = parser.parse_args()

    samples = json.loads(args.input.read_text(encoding="utf-8"))
    aggregates = compute_aggregates(samples)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(aggregates, indent=2), encoding="utf-8")
    print(f"Wrote aggregates for {len(aggregates)} clubs to {args.output}")


if __name__ == "__main__":
    main()
