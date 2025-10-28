import json
import pathlib
import subprocess
import sys

SCRIPT = pathlib.Path("scripts/build_training_catalog.py")


def test_build_catalog_writes_version_and_counts(tmp_path: pathlib.Path):
    packs_dir = tmp_path / "packs"
    packs_dir.mkdir()
    (packs_dir / "putting_v1.json").write_text(
        json.dumps(
            {
                "packId": "putting_v1",
                "version": "1.0.0",
                "drills": [{"id": "d1", "focus": "putt"}],
                "plans": [
                    {
                        "id": "p1",
                        "focus": "putt",
                        "version": "1.0.0",
                        "drills": [{"id": "d1"}],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    out_path = tmp_path / "catalog.json"
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--packs-dir",
            str(packs_dir),
            "--out",
            str(out_path),
            "--version",
            "9.9.9",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr

    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert data["version"] == "9.9.9"
    assert data["packs"][0]["packId"] == "putting_v1"
    assert data["packs"][0]["plans"] == 1
    assert data["packs"][0]["drills"] == 1
    assert "putt" in data["packs"][0]["focus"]
