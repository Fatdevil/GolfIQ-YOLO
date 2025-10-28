from __future__ import annotations

import json
import pathlib
import subprocess
import sys
from typing import Any

SCRIPT = pathlib.Path("server/scripts/validate_training_packs.py").resolve()


def run_validator(
    tmpdir: pathlib.Path, catalog_obj: dict[str, Any], expect_ok: bool
) -> None:
    packs_dir = tmpdir / "packs"
    packs_dir.mkdir()
    (packs_dir / "ok.json").write_text(
        json.dumps({"packId": "x", "version": "1.0.0", "drills": [], "plans": []}),
        encoding="utf-8",
    )

    catalog_path = tmpdir / "catalog.json"
    catalog_path.write_text(json.dumps(catalog_obj), encoding="utf-8")

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--packs-dir",
            str(packs_dir),
            "--catalog",
            str(catalog_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    if expect_ok:
        assert result.returncode == 0, result.stdout + result.stderr
    else:
        assert result.returncode != 0, "validator should fail"


def test_catalog_ok(tmp_path: pathlib.Path) -> None:
    run_validator(
        tmp_path,
        {
            "version": "1.0.0",
            "packs": [
                {
                    "packId": "x",
                    "version": "1.0.0",
                    "focus": ["putt"],
                    "plans": 0,
                    "drills": 0,
                }
            ],
        },
        expect_ok=True,
    )


def test_catalog_bad_missing_fields(tmp_path: pathlib.Path) -> None:
    run_validator(
        tmp_path,
        {
            "version": "1.0.0",
            "packs": [
                {
                    "focus": ["putt"],
                    "plans": 0,
                    "drills": 0,
                }
            ],
        },
        expect_ok=False,
    )
