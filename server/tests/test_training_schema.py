from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_validate_training_packs_smoke(tmp_path: Path) -> None:
    packs_dir = tmp_path / "packs"
    packs_dir.mkdir(parents=True, exist_ok=True)
    pack = {
        "packId": "smoke",
        "version": "1.0",
        "drills": [
            {
                "id": "tempo-chip",
                "focus": "short",
                "title": "Tempo chip",
                "description": "Controlled tempo chips inside 10m.",
                "estTimeMin": 8,
                "targetMetric": {"type": "SG", "segment": "short"},
                "difficulty": 2,
            }
        ],
        "plans": [
            {
                "id": "short-reset",
                "name": "Short game reset",
                "focus": "short",
                "version": "1.0",
                "drills": [
                    {"id": "tempo-chip", "reps": 5},
                ],
            }
        ],
    }
    target = packs_dir / "smoke.json"
    target.write_text(json.dumps(pack), encoding="utf-8")

    result = subprocess.run(
        [
            "python",
            "server/scripts/validate_training_packs.py",
            "--packs-dir",
            str(packs_dir),
            "--catalog",
            str(tmp_path / "missing.json"),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Training packs/catalog OK" in result.stdout
