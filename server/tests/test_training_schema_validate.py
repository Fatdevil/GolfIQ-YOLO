import json
from pathlib import Path

from server.scripts.validate_training_packs import main as validate_main


def _write_pack(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_validate_training_packs_handles_ok_and_bad(tmp_path):
    good_dir = tmp_path / "good"
    bad_dir = tmp_path / "bad"
    good_dir.mkdir()
    bad_dir.mkdir()

    ok_pack = {
        "packId": "ok-pack",
        "version": "1.0",
        "drills": [
            {
                "id": "drill-a",
                "focus": "putt",
                "title": "Lag circle",
                "description": "Work on lag putting.",
                "estTimeMin": 10,
                "targetMetric": {"type": "SG", "segment": "putt"},
                "difficulty": 2,
            }
        ],
        "plans": [
            {
                "id": "plan-a",
                "name": "Putt boost",
                "focus": "putt",
                "version": "1.0",
                "drills": [{"id": "drill-a"}],
            }
        ],
    }
    _write_pack(good_dir / "ok.json", ok_pack)

    bad_pack = {
        "version": "1.0",
        "drills": [],
        "plans": [],
        "extraField": True,
    }
    _write_pack(bad_dir / "bad.json", bad_pack)

    assert (
        validate_main(
            ["--packs-dir", str(good_dir), "--catalog", str(good_dir / "missing.json")]
        )
        == 0
    )
    assert (
        validate_main(
            ["--packs-dir", str(bad_dir), "--catalog", str(bad_dir / "missing.json")]
        )
        != 0
    )
