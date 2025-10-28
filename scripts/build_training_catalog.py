#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_PACKS_DIR = ROOT / "data" / "training" / "packs"
DEFAULT_OUTPUT = ROOT / "data" / "training" / "catalog.json"

FocusValue = str


def _load_json(path: pathlib.Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
        if not isinstance(data, dict):
            raise ValueError(f"{path} must contain a JSON object")
        return data


def _ordered_unique(values: list[FocusValue]) -> list[FocusValue]:
    seen: set[FocusValue] = set()
    ordered: list[FocusValue] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _collect_focus(pack: dict[str, Any]) -> list[FocusValue]:
    focus_entries: list[FocusValue] = []
    persona = pack.get("persona")
    if isinstance(persona, dict):
        persona_focus = persona.get("focus")
        if isinstance(persona_focus, list):
            focus_entries.extend(
                [entry for entry in persona_focus if isinstance(entry, str)]
            )
    drills = pack.get("drills")
    if isinstance(drills, list):
        focus_entries.extend(
            [
                drill.get("focus")
                for drill in drills
                if isinstance(drill, dict) and isinstance(drill.get("focus"), str)
            ]
        )
    plans = pack.get("plans")
    if isinstance(plans, list):
        focus_entries.extend(
            [
                plan.get("focus")
                for plan in plans
                if isinstance(plan, dict) and isinstance(plan.get("focus"), str)
            ]
        )
    return _ordered_unique(focus_entries)


def build_catalog(packs_dir: pathlib.Path, version: str) -> dict[str, Any]:
    pack_entries = []
    if packs_dir.exists():
        for path in sorted(packs_dir.glob("*.json")):
            pack = _load_json(path)
            pack_id = pack.get("packId")
            pack_version = pack.get("version")
            if not isinstance(pack_id, str) or not pack_id:
                raise ValueError(f"{path} missing packId")
            if not isinstance(pack_version, str) or not pack_version:
                raise ValueError(f"{path} missing version")
            drills = pack.get("drills")
            plans = pack.get("plans")
            pack_entries.append(
                {
                    "packId": pack_id,
                    "version": pack_version,
                    "focus": _collect_focus(pack),
                    "plans": len(plans) if isinstance(plans, list) else 0,
                    "drills": len(drills) if isinstance(drills, list) else 0,
                }
            )
    pack_entries.sort(key=lambda entry: entry["packId"])
    return {"version": version, "packs": pack_entries}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build training pack catalog metadata")
    parser.add_argument("--packs-dir", type=pathlib.Path, default=DEFAULT_PACKS_DIR)
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--version", required=True)
    parser.add_argument(
        "--pretty", action="store_true", help="Write catalog with indentation"
    )
    args = parser.parse_args(argv)

    catalog = build_catalog(args.packs_dir, args.version)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as handle:
        if args.pretty:
            json.dump(catalog, handle, indent=2)
            handle.write("\n")
        else:
            json.dump(catalog, handle, separators=(",", ":"))
            handle.write("\n")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())
