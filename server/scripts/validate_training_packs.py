#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List

from jsonschema import Draft7Validator

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / 'data' / 'training'
MAX_FILE_BYTES = 50 * 1024

FOCUS_VALUES = [
    'long-drive',
    'tee',
    'approach',
    'wedge',
    'short',
    'putt',
    'recovery',
]

SCHEMA: Dict[str, Any] = {
    '$schema': 'http://json-schema.org/draft-07/schema#',
    'type': 'object',
    'required': ['packId', 'version', 'drills', 'plans'],
    'additionalProperties': False,
    'properties': {
        'packId': {'type': 'string', 'minLength': 1},
        'version': {'type': 'string', 'minLength': 1},
        'author': {'type': 'string', 'minLength': 1},
        'updatedAt': {'type': 'string', 'minLength': 1},
        'persona': {'$ref': '#/definitions/persona'},
        'drills': {
            'type': 'array',
            'minItems': 1,
            'items': {'$ref': '#/definitions/drill'},
        },
        'plans': {
            'type': 'array',
            'minItems': 1,
            'items': {'$ref': '#/definitions/plan'},
        },
    },
    'definitions': {
        'persona': {
            'type': 'object',
            'required': ['id', 'name', 'focus', 'version'],
            'additionalProperties': False,
            'properties': {
                'id': {'type': 'string', 'minLength': 1},
                'name': {'type': 'string', 'minLength': 1},
                'version': {'type': 'string', 'minLength': 1},
                'focus': {
                    'type': 'array',
                    'minItems': 1,
                    'items': {'enum': FOCUS_VALUES},
                    'uniqueItems': True,
                },
                'premium': {'type': 'boolean'},
                'styleHints': {
                    'type': 'object',
                    'additionalProperties': False,
                    'properties': {
                        'tone': {'enum': ['concise', 'neutral', 'pep']},
                        'verbosity': {'enum': ['short', 'normal', 'detailed']},
                    },
                },
            },
        },
        'targetMetric': {
            'type': 'object',
            'required': ['type', 'segment'],
            'additionalProperties': False,
            'properties': {
                'type': {'enum': ['SG', 'dispersion', 'make%', 'speed']},
                'segment': {'enum': FOCUS_VALUES},
            },
        },
        'drill': {
            'type': 'object',
            'required': ['id', 'focus', 'title', 'description', 'estTimeMin', 'targetMetric', 'difficulty'],
            'additionalProperties': False,
            'properties': {
                'id': {'type': 'string', 'minLength': 1},
                'focus': {'enum': FOCUS_VALUES},
                'title': {'type': 'string', 'minLength': 1},
                'description': {'type': 'string', 'minLength': 1},
                'estTimeMin': {'type': 'integer', 'minimum': 1},
                'prerequisites': {
                    'type': 'array',
                    'items': {'type': 'string', 'minLength': 1},
                },
                'requiredGear': {
                    'type': 'array',
                    'items': {'type': 'string', 'minLength': 1},
                },
                'targetMetric': {'$ref': '#/definitions/targetMetric'},
                'difficulty': {'type': 'integer', 'minimum': 1, 'maximum': 5},
            },
        },
        'planDrill': {
            'type': 'object',
            'required': ['id'],
            'additionalProperties': False,
            'properties': {
                'id': {'type': 'string', 'minLength': 1},
                'reps': {'type': 'integer', 'minimum': 1},
                'durationMin': {'type': 'integer', 'minimum': 1},
            },
        },
        'plan': {
            'type': 'object',
            'required': ['id', 'name', 'focus', 'version', 'drills'],
            'additionalProperties': False,
            'properties': {
                'id': {'type': 'string', 'minLength': 1},
                'name': {'type': 'string', 'minLength': 1},
                'focus': {'enum': FOCUS_VALUES},
                'version': {'type': 'string', 'minLength': 1},
                'drills': {
                    'type': 'array',
                    'minItems': 1,
                    'items': {'$ref': '#/definitions/planDrill'},
                },
                'schedule': {'type': 'string', 'minLength': 1},
                'estTotalMin': {'type': 'integer', 'minimum': 1},
            },
        },
    },
}


def iter_json_files(base: Path) -> List[Path]:
    if not base.exists():
        return []
    return sorted(path for path in base.rglob('*.json') if path.is_file())


def validate_duplicates(entries: Iterable[Dict[str, Any]], key: str, label: str) -> List[str]:
    seen = set()
    duplicates: List[str] = []
    for entry in entries:
        value = entry.get(key)
        if not isinstance(value, str):
            continue
        if value in seen:
            duplicates.append(f"Duplicate {label} id {value}")
        else:
            seen.add(value)
    return duplicates


def validate_plan_drills(pack: Dict[str, Any]) -> List[str]:
    drills = pack.get('drills') or []
    drill_ids = {item.get('id') for item in drills if isinstance(item, dict)}
    errors: List[str] = []
    for plan in pack.get('plans') or []:
        if not isinstance(plan, dict):
            continue
        for drill in plan.get('drills') or []:
            if not isinstance(drill, dict):
                continue
            drill_id = drill.get('id')
            if drill_id not in drill_ids:
                errors.append(f"Plan {plan.get('id')} references missing drill {drill_id}")
    return errors


def validate_file(path: Path, validator: Draft7Validator) -> List[str]:
    errors: List[str] = []
    data_bytes = path.read_bytes()
    if len(data_bytes) > MAX_FILE_BYTES:
        errors.append(f"{path}: file exceeds {MAX_FILE_BYTES} bytes")
        return errors
    try:
        payload = json.loads(data_bytes)
    except json.JSONDecodeError as exc:
        errors.append(f"{path}: JSON parse error - {exc}")
        return errors
    for error in validator.iter_errors(payload):
        location = '.'.join(str(item) for item in error.absolute_path)
        prefix = f"{path}: "
        if location:
            prefix += f"{location} - "
        errors.append(f"{prefix}{error.message}")
    if errors:
        return errors
    assert isinstance(payload, dict)
    errors.extend(validate_duplicates(payload.get('drills') or [], 'id', 'drill'))
    errors.extend(validate_duplicates(payload.get('plans') or [], 'id', 'plan'))
    errors.extend(validate_plan_drills(payload))
    return errors


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description='Validate training content packs')
    parser.add_argument('--base', type=Path, default=DATA_DIR, help='Directory to scan for training packs')
    args = parser.parse_args(argv)

    base_dir: Path = args.base
    files = iter_json_files(base_dir)
    if not files:
        print(f"No training packs found under {base_dir}")
        return 0

    validator = Draft7Validator(SCHEMA)
    failures = 0
    for file_path in files:
        problems = validate_file(file_path, validator)
        if problems:
            failures += 1
            for problem in problems:
                print(problem, file=sys.stderr)
        else:
            print(f"OK \u2713 {file_path.relative_to(base_dir)}")

    if failures:
        print(f"Validation failed for {failures} file(s)", file=sys.stderr)
        return 1

    print(f"Validated {len(files)} training pack(s)")
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
