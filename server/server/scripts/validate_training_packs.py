#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any

from jsonschema import ValidationError, validate

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_PACKS_DIR = ROOT / "data" / "training" / "packs"
DEFAULT_CATALOG = ROOT / "data" / "training" / "catalog.json"

PACK_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["packId", "version", "drills", "plans"],
    "properties": {
        "packId": {"type": "string", "minLength": 1},
        "version": {"type": "string", "minLength": 1},
        "author": {"type": "string"},
        "updatedAt": {"type": "string"},
        "persona": {"type": "object"},
        "drills": {"type": "array"},
        "plans": {"type": "array"},
    },
}

CATALOG_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["version", "packs"],
    "properties": {
        "version": {"type": "string", "minLength": 1},
        "packs": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["packId", "version", "focus", "plans", "drills"],
                "properties": {
                    "packId": {"type": "string", "minLength": 1},
                    "version": {"type": "string", "minLength": 1},
                    "focus": {"type": "array"},
                    "plans": {"type": "integer", "minimum": 0},
                    "drills": {"type": "integer", "minimum": 0},
                },
            },
        },
    },
}


def _load_json(path: pathlib.Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_file(path: pathlib.Path, schema: dict[str, Any]) -> list[str]:
    try:
        validate(_load_json(path), schema)
        return []
    except ValidationError as exc:  # pragma: no cover - exercised in tests
        return [f"{path}: {exc.message}"]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--packs-dir", type=pathlib.Path, default=DEFAULT_PACKS_DIR)
    parser.add_argument("--catalog", type=pathlib.Path, default=DEFAULT_CATALOG)
    args = parser.parse_args(argv)

    errors: list[str] = []

    if args.packs_dir.exists():
        for path in sorted(args.packs_dir.glob("*.json")):
            errors.extend(validate_file(path, PACK_SCHEMA))

    if args.catalog.exists():
        errors.extend(validate_file(args.catalog, CATALOG_SCHEMA))

    if errors:
        print("\n".join(errors))
        print(f"Validation failed for {len(errors)} error(s)")
        return 1

    print("Training packs/catalog OK ✔")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())
