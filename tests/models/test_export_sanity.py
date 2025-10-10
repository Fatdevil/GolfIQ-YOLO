import os
import subprocess
import sys
from pathlib import Path

import pytest

pytest.importorskip("onnx")
pytest.importorskip("onnxruntime")


def run_export(tmp_path: Path):
    report_path = tmp_path / "EXPORT_REPORT.md"
    output_dir = tmp_path / "artifacts"
    cmd = [
        sys.executable,
        "scripts/export_models.py",
        "--output-dir",
        str(output_dir),
        "--report",
        str(report_path),
        "--frames",
        "3",
        "--dry-run",
    ]
    env = os.environ.copy()
    env["PYTHONWARNINGS"] = "ignore"  # keep logs deterministic
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env, check=True)
    return proc.stdout, report_path


def test_export_script_emits_metadata(tmp_path):
    stdout, report_path = run_export(tmp_path)

    assert "Artifact onnx" in stdout
    assert "Sanity reference-numpy PASS" in stdout
    assert "Benchmark onnx" in stdout
    assert "Environment:" in stdout

    # TFLite may be unavailable in CI but the harness should still log the backend.
    assert "tflite-fp32" in stdout

    assert report_path.exists(), "report was not created"
    report_text = report_path.read_text()
    assert "## Sanity Checks" in report_text
    assert "reference-numpy" in report_text
    assert "Micro-benchmark" in report_text
