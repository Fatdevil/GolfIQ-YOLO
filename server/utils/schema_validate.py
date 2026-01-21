from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import jsonschema


@lru_cache(maxsize=1)
def _load_ux_payload_schema() -> dict[str, Any]:
    root = Path(__file__).resolve().parents[2]
    schema_path = root / "docs" / "schemas" / "ux_payload_v1.schema.json"
    with schema_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate_ux_payload_v1(payload: dict[str, Any]) -> None:
    schema = _load_ux_payload_schema()
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda err: err.path)
    if errors:
        details = "\n".join(
            f"- {'/'.join(str(part) for part in error.path)}: {error.message}"
            for error in errors
        )
        raise AssertionError(f"ux_payload_v1 schema validation failed:\n{details}")
