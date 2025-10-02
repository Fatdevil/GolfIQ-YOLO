#!/usr/bin/env python3
"""Aggregate edge-bench telemetry into CSV and Markdown scoreboards."""
from __future__ import annotations

import argparse
import csv
import json
import os
from collections.abc import Iterable, Mapping, MutableMapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Optional, TextIO

MetricName = str
GroupKey = tuple[str, str, str, str, str]

# Candidate field names for each metric so the tool can tolerate schema drifts.
METRIC_FIELDS: Mapping[MetricName, Sequence[str]] = {
    "fps": ("fps", "fps_avg", "fps_mean", "frames_per_second"),
    "latency_p50": (
        "latency_p50",
        "latency_ms_p50",
        "latency_p50_ms",
        "latency_median_ms",
    ),
    "latency_p95": (
        "latency_p95",
        "latency_ms_p95",
        "latency_p95_ms",
        "latency_tail_ms",
    ),
    "cold_start_ms": (
        "cold_start_ms",
        "cold_ms",
        "cold_latency_ms",
    ),
    "battery_drop_15m": (
        "battery_drop_15m",
        "battery_drop_pct_15m",
        "battery_drop_percent_15m",
    ),
}

GROUP_FIELDS = ("device", "os", "runtime", "input_res", "quant")


@dataclass
class MetricAccumulator:
    """Accumulates metric samples for a single device profile."""

    count: int = 0
    samples: MutableMapping[MetricName, list[float]] = field(
        default_factory=lambda: {name: [] for name in METRIC_FIELDS}
    )

    def add_event(self, event: Mapping[str, object]) -> None:
        self.count += 1
        for metric, candidates in METRIC_FIELDS.items():
            value = _extract_metric(event, candidates)
            if value is not None:
                self.samples[metric].append(value)

    def reduce(self) -> dict[str, Optional[float]]:
        return {
            metric: (mean(values) if values else None)
            for metric, values in self.samples.items()
        }


def _extract_metric(
    event: Mapping[str, object], candidates: Sequence[str]
) -> Optional[float]:
    for name in candidates:
        value = _dig(event, name)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _dig(data: Mapping[str, object], dotted: str) -> Optional[object]:
    parts = dotted.split(".")
    current: object = data
    for part in parts:
        if isinstance(current, Mapping) and part in current:
            current = current[part]  # type: ignore[index]
        else:
            return None
    return current


def discover_input_dir(explicit: Optional[str]) -> Path:
    if explicit:
        return Path(explicit)
    env = os.environ.get("FLIGHT_RECORDER_DIR")
    if env:
        return Path(env)
    return Path("var/flight")


def load_events(directory: Path) -> Iterable[Mapping[str, object]]:
    if not directory.exists():
        return []
    for path in sorted(directory.rglob("*.jsonl")):
        if not path.is_file():
            continue
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(event, Mapping):
                    yield event


def group_events(
    events: Iterable[Mapping[str, object]],
) -> dict[GroupKey, MetricAccumulator]:
    groups: dict[GroupKey, MetricAccumulator] = {}
    for event in events:
        if event.get("suite") != "edge-bench":
            continue
        key = tuple(str(event.get(field, "unknown")) for field in GROUP_FIELDS)
        if key not in groups:
            groups[key] = MetricAccumulator()
        groups[key].add_event(event)
    return groups


def summarize_groups(
    groups: Mapping[GroupKey, MetricAccumulator],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for key, accumulator in groups.items():
        metrics = accumulator.reduce()
        row: dict[str, object] = dict(zip(GROUP_FIELDS, key))
        row["samples"] = accumulator.count
        row["fps_avg"] = metrics["fps"]
        row["latency_p50"] = metrics["latency_p50"]
        row["latency_p95"] = metrics["latency_p95"]
        row["cold_ms_avg"] = metrics["cold_start_ms"]
        row["battery_drop_15m_avg"] = metrics["battery_drop_15m"]
        rows.append(row)
    rows.sort(key=lambda r: (-(r["fps_avg"] or 0.0), r["latency_p50"] or float("inf")))
    return rows


def format_float(value: Optional[float], precision: int = 2) -> str:
    if value is None:
        return "—"
    return f"{value:.{precision}f}"


def write_csv(rows: Sequence[Mapping[str, object]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        *GROUP_FIELDS,
        "samples",
        "fps_avg",
        "latency_p50",
        "latency_p95",
        "cold_ms_avg",
        "battery_drop_15m_avg",
    ]
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    **{name: row[name] for name in GROUP_FIELDS},
                    "samples": row["samples"],
                    "fps_avg": format_float(row["fps_avg"]),
                    "latency_p50": format_float(row["latency_p50"]),
                    "latency_p95": format_float(row["latency_p95"]),
                    "cold_ms_avg": format_float(row["cold_ms_avg"]),
                    "battery_drop_15m_avg": format_float(row["battery_drop_15m_avg"]),
                }
            )


def write_markdown(rows: Sequence[Mapping[str, object]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    winners = choose_winners(rows)
    with output.open("w", encoding="utf-8") as handle:
        handle.write("# Edge Bench Scoreboard\n\n")
        handle.write(f"Generated on {timestamp}.\n\n")
        handle.write("## Winners by Platform\n\n")
        if winners:
            write_markdown_table(handle, winners)
            handle.write("\n")
        else:
            handle.write("No edge-bench telemetry found.\n\n")
        handle.write("## Full Results\n\n")
        if rows:
            write_markdown_table(handle, rows)
        else:
            handle.write("No data available.\n")


def choose_winners(rows: Sequence[Mapping[str, object]]) -> list[Mapping[str, object]]:
    best_per_os: dict[str, Mapping[str, object]] = {}
    for row in rows:
        os_name = str(row["os"])
        candidate = best_per_os.get(os_name)
        if candidate is None:
            best_per_os[os_name] = row
            continue
        if (row["fps_avg"] or 0.0) > (candidate["fps_avg"] or 0.0):
            best_per_os[os_name] = row
        elif (row["fps_avg"] or 0.0) == (candidate["fps_avg"] or 0.0):
            if (row["latency_p50"] or float("inf")) < (
                candidate["latency_p50"] or float("inf")
            ):
                best_per_os[os_name] = row
    return sorted(best_per_os.values(), key=lambda row: str(row["os"]).lower())


def write_markdown_table(handle: TextIO, rows: Sequence[Mapping[str, object]]) -> None:
    headers = [
        "Device",
        "OS",
        "Runtime",
        "Input Res",
        "Quant",
        "Samples",
        "FPS Avg",
        "Latency P50 (ms)",
        "Latency P95 (ms)",
        "Cold Start (ms)",
        "Battery Drop 15m (%)",
    ]
    handle.write("| " + " | ".join(headers) + " |\n")
    handle.write("|" + "---|" * len(headers) + "\n")
    for row in rows:
        handle.write(
            "| "
            + " | ".join(
                [
                    str(row["device"]),
                    str(row["os"]),
                    str(row["runtime"]),
                    str(row["input_res"]),
                    str(row["quant"]),
                    str(row["samples"]),
                    format_float(row["fps_avg"]),
                    format_float(row["latency_p50"]),
                    format_float(row["latency_p95"]),
                    format_float(row["cold_ms_avg"]),
                    format_float(row["battery_drop_15m_avg"]),
                ]
            )
            + " |\n"
        )


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=str,
        help="Override the telemetry directory (defaults to $FLIGHT_RECORDER_DIR or var/flight)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="reports",
        help="Output directory for generated scoreboards (default: reports)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    input_dir = discover_input_dir(args.input)
    events = list(load_events(input_dir))
    groups = group_events(events)
    rows = summarize_groups(groups)
    output_dir = Path(args.output)
    write_csv(rows, output_dir / "edge_bench.csv")
    write_markdown(rows, output_dir / "edge_bench.md")
    if rows:
        print(f"Aggregated {len(events)} events into {len(rows)} device profiles.")
    else:
        print("No edge-bench telemetry found; generated empty scoreboards.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
