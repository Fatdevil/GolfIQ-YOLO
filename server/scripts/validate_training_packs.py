#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from typing import Any

from jsonschema import ValidationError, validate

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_PACKS_DIR = ROOT / "data" / "training" / "packs"
DEFAULT_CATALOG = ROOT / "data" / "training" / "catalog.json"
MAX_PACK_BYTES = 50 * 1024
ALLOWED_FOCUS = {
    "long-drive",
    "tee",
    "approach",
    "wedge",
    "short",
    "putt",
    "recovery",
}
VERSION_RE = re.compile(r"^(?:\d+\.\d+\.\d+|\d{4}\.\d{2})$")

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


def _validate_schema(
    instance: Any, schema: dict[str, Any], path: pathlib.Path
) -> list[str]:
    try:
        validate(instance, schema)
        return []
    except ValidationError as exc:  # pragma: no cover - exercised in tests
        return [f"{path}: {exc.message}"]


def _ensure_pack_focus(value: Any, label: str) -> list[str]:
    errors: list[str] = []
    if isinstance(value, list):
        for index, focus in enumerate(value):
            if not isinstance(focus, str) or focus not in ALLOWED_FOCUS:
                errors.append(
                    f"{label}[{index}] must be one of {sorted(ALLOWED_FOCUS)}"
                )
    elif value is not None:
        errors.append(f"{label} must be an array")
    return errors


def _validate_pack_rules(
    path: pathlib.Path, pack: dict[str, Any], state: dict[str, set[str]]
) -> list[str]:
    errors: list[str] = []
    file_size = path.stat().st_size
    if file_size > MAX_PACK_BYTES:
        errors.append(f"{path} exceeds {MAX_PACK_BYTES} bytes ({file_size} bytes)")

    pack_id = pack.get("packId")
    if isinstance(pack_id, str):
        if pack_id in state["pack"]:
            errors.append(f"Duplicate packId {pack_id} found in {path}")
        else:
            state["pack"].add(pack_id)
    else:
        errors.append(f"{path} packId must be a string")

    version = pack.get("version")
    if isinstance(version, str):
        if not VERSION_RE.match(version):
            errors.append(
                f"{path} version must be semantic (1.2.3) or YYYY.MM formatted"
            )
    else:
        errors.append(f"{path} version must be a string")

    persona = pack.get("persona")
    if isinstance(persona, dict):
        errors.extend(_ensure_pack_focus(persona.get("focus"), f"{path} persona.focus"))
    elif persona is not None:
        errors.append(f"{path} persona must be an object if present")

    drills = pack.get("drills")
    pack_drill_ids: set[str] = set()
    if isinstance(drills, list):
        for index, drill in enumerate(drills):
            if not isinstance(drill, dict):
                errors.append(f"{path} drills[{index}] must be an object")
                continue
            drill_id = drill.get("id")
            if isinstance(drill_id, str):
                if drill_id in pack_drill_ids:
                    errors.append(f"{path} drills contains duplicate id {drill_id}")
                else:
                    pack_drill_ids.add(drill_id)
                if drill_id in state["drill"]:
                    errors.append(f"Duplicate drill id {drill_id} found across packs")
                else:
                    state["drill"].add(drill_id)
            else:
                errors.append(f"{path} drills[{index}].id must be a string")

            drill_focus = drill.get("focus")
            if not isinstance(drill_focus, str) or drill_focus not in ALLOWED_FOCUS:
                errors.append(
                    f"{path} drills[{index}].focus must be one of {sorted(ALLOWED_FOCUS)}"
                )

            target_metric = drill.get("targetMetric")
            if isinstance(target_metric, dict):
                segment = target_metric.get("segment")
                if not isinstance(segment, str) or segment not in ALLOWED_FOCUS:
                    errors.append(
                        f"{path} drills[{index}].targetMetric.segment must be one of {sorted(ALLOWED_FOCUS)}"
                    )
            else:
                errors.append(f"{path} drills[{index}].targetMetric must be an object")
    else:
        errors.append(f"{path} drills must be an array")

    plans = pack.get("plans")
    if isinstance(plans, list):
        for index, plan in enumerate(plans):
            if not isinstance(plan, dict):
                errors.append(f"{path} plans[{index}] must be an object")
                continue
            plan_id = plan.get("id")
            if isinstance(plan_id, str):
                if plan_id in state["plan"]:
                    errors.append(f"Duplicate plan id {plan_id} found across packs")
                else:
                    state["plan"].add(plan_id)
            else:
                errors.append(f"{path} plans[{index}].id must be a string")

            plan_focus = plan.get("focus")
            if not isinstance(plan_focus, str) or plan_focus not in ALLOWED_FOCUS:
                errors.append(
                    f"{path} plans[{index}].focus must be one of {sorted(ALLOWED_FOCUS)}"
                )

            drills_ref = plan.get("drills")
            if isinstance(drills_ref, list):
                for drill_index, entry in enumerate(drills_ref):
                    if not isinstance(entry, dict):
                        errors.append(
                            f"{path} plans[{index}].drills[{drill_index}] must be an object"
                        )
                        continue
                    drill_ref = entry.get("id")
                    if not isinstance(drill_ref, str):
                        errors.append(
                            f"{path} plans[{index}].drills[{drill_index}].id must be a string"
                        )
                    elif drill_ref not in pack_drill_ids:
                        errors.append(
                            f"{path} plans[{index}].drills[{drill_index}] references unknown drill id {drill_ref}"
                        )
            else:
                errors.append(f"{path} plans[{index}].drills must be an array")
    else:
        errors.append(f"{path} plans must be an array")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--packs-dir", type=pathlib.Path, default=DEFAULT_PACKS_DIR)
    parser.add_argument("--catalog", type=pathlib.Path, default=DEFAULT_CATALOG)
    args = parser.parse_args(argv)

    errors: list[str] = []

    pack_payloads: list[tuple[pathlib.Path, dict[str, Any]]] = []
    if args.packs_dir.exists():
        for path in sorted(args.packs_dir.glob("*.json")):
            try:
                payload = _load_json(path)
            except json.JSONDecodeError as exc:
                errors.append(f"{path}: invalid JSON - {exc.msg}")
                continue
            errors.extend(_validate_schema(payload, PACK_SCHEMA, path))
            if isinstance(payload, dict):
                pack_payloads.append((path, payload))
            else:
                errors.append(f"{path}: root must be a JSON object")

    state: dict[str, set[str]] = {"pack": set(), "plan": set(), "drill": set()}
    for path, payload in pack_payloads:
        errors.extend(_validate_pack_rules(path, payload, state))

    if args.catalog.exists():
        try:
            catalog_payload = _load_json(args.catalog)
        except json.JSONDecodeError as exc:
            errors.append(f"{args.catalog}: invalid JSON - {exc.msg}")
        else:
            errors.extend(
                _validate_schema(catalog_payload, CATALOG_SCHEMA, args.catalog)
            )

    if errors:
        print("\n".join(errors))
        print(f"Validation failed for {len(errors)} error(s)")
        return 1

    print("Training packs/catalog OK ✔")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())
