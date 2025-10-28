import json
import subprocess
import sys
from pathlib import Path

from server.scripts.validate_training_packs import main as validate_main


REPO_ROOT = Path(__file__).resolve().parents[2]


def _write_pack(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_validate_training_packs_smoke(tmp_path):
    packs_dir = tmp_path / "packs"
    packs_dir.mkdir()

    _write_pack(
        packs_dir / "smoke.json",
        {"packId": "smoke", "version": "1.0.0", "drills": [], "plans": []},
    )

    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(
        json.dumps({"version": "1.0.0", "packs": []}), encoding="utf-8"
    )

    res = subprocess.run(
        [
            sys.executable,
            str(REPO_ROOT / "server" / "scripts" / "validate_training_packs.py"),
            "--packs-dir",
            str(packs_dir),
            "--catalog",
            str(catalog_path),
        ],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, res.stdout + res.stderr


def test_validate_training_packs_handles_ok_and_bad(tmp_path):
    good_dir = tmp_path / "good"
    bad_dir = tmp_path / "bad"
    good_dir.mkdir()
    bad_dir.mkdir()

    ok_pack = {"packId": "good", "version": "1.0.0", "drills": [], "plans": []}
    _write_pack(good_dir / "good.json", ok_pack)

    bad_pack = {"version": "1.0.0", "drills": []}
    _write_pack(bad_dir / "missing.json", bad_pack)

    ok = validate_main(["--packs-dir", str(good_dir)])
    assert ok == 0

    bad = validate_main(["--packs-dir", str(bad_dir)])
    assert bad != 0
