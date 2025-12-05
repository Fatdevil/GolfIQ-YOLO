#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import sys


def collect_focus(pack_obj: dict) -> list[str]:
    """Collect the union of focus identifiers referenced within a pack."""

    focus = set()
    persona = pack_obj.get("persona") or {}
    for item in persona.get("focus") or []:
        focus.add(str(item))
    for drill in pack_obj.get("drills") or []:
        if drill.get("focus"):
            focus.add(str(drill["focus"]))
    for plan in pack_obj.get("plans") or []:
        if plan.get("focus"):
            focus.add(str(plan["focus"]))
    return sorted(focus)


def build_catalog(packs_dir: pathlib.Path, version: str) -> dict:
    """Build a catalog manifest summarizing available training packs."""

    catalog = {"version": version, "packs": []}
    if packs_dir.exists():
        for path in sorted(packs_dir.glob("*.json")):
            try:
                pack_obj = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                # Skip unreadable packs; the validator will surface issues separately.
                continue

            try:
                pack_id = pack_obj["packId"]
            except KeyError:
                # Without a packId we cannot reference the pack in the catalog.
                continue

            catalog["packs"].append(
                {
                    "packId": pack_id,
                    "version": pack_obj.get("version", "0.0.0"),
                    "focus": collect_focus(pack_obj),
                    "plans": len(pack_obj.get("plans") or []),
                    "drills": len(pack_obj.get("drills") or []),
                }
            )
    return catalog


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--packs-dir",
        type=pathlib.Path,
        default=pathlib.Path("data/training/packs"),
        help="Directory containing individual training pack JSON files.",
    )
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        default=pathlib.Path("data/training/catalog.json"),
        help="Destination path for the generated catalog JSON file.",
    )
    parser.add_argument(
        "--version",
        type=str,
        default="1.0.0",
        help="Semantic version assigned to the generated catalog.",
    )
    args = parser.parse_args(argv)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    catalog = build_catalog(args.packs_dir, args.version)
    args.out.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote catalog {args.out} with {len(catalog['packs'])} packs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
