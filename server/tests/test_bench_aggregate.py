from __future__ import annotations

import json
from pathlib import Path

from scripts.edge_recommend import EdgeRun, compute_recommendations, recommend_defaults


def _run(
    *,
    platform: str,
    runtime: str,
    input_size: int,
    quant: str,
    threads: int,
    delegate: str | None,
    fps: float,
    p95: float,
    battery: float | None = None,
) -> EdgeRun:
    return EdgeRun(
        platform=platform,
        runtime=runtime,
        input_size=input_size,
        quant=quant,
        threads=threads,
        delegate=delegate,
        fps=fps,
        p95=p95,
        battery_delta=battery,
    )


def test_prefers_latency_then_fps():
    runs = [
        _run(
            platform="android",
            runtime="tflite",
            input_size=320,
            quant="int8",
            threads=4,
            delegate="nnapi",
            fps=48.2,
            p95=35.5,
            battery=0.8,
        ),
        _run(
            platform="android",
            runtime="onnx",
            input_size=320,
            quant="fp16",
            threads=2,
            delegate="gpu",
            fps=51.0,
            p95=39.9,
            battery=0.6,
        ),
        _run(
            platform="android",
            runtime="ncnn",
            input_size=320,
            quant="fp32",
            threads=4,
            delegate="cpu",
            fps=46.0,
            p95=33.2,
            battery=1.1,
        ),
    ]

    rec = compute_recommendations(runs)
    assert rec["android"] == {
        "runtime": "ncnn",
        "inputSize": 320,
        "quant": "fp32",
        "threads": 4,
        "delegate": "cpu",
    }


def test_breaks_ties_deterministically():
    runs = [
        _run(
            platform="ios",
            runtime="coreml",
            input_size=384,
            quant="fp16",
            threads=2,
            delegate=None,
            fps=60.0,
            p95=28.0,
            battery=0.4,
        ),
        _run(
            platform="ios",
            runtime="tflite",
            input_size=384,
            quant="fp16",
            threads=2,
            delegate=None,
            fps=60.0,
            p95=28.0,
            battery=0.6,
        ),
        _run(
            platform="ios",
            runtime="onnx",
            input_size=384,
            quant="fp16",
            threads=2,
            delegate=None,
            fps=60.0,
            p95=28.0,
            battery=0.4,
        ),
    ]

    rec = compute_recommendations(runs)
    assert rec["ios"] == {
        "runtime": "coreml",
        "inputSize": 384,
        "quant": "fp16",
        "threads": 2,
    }


def test_recommend_defaults_writes_output(tmp_path: Path):
    runs_path = tmp_path / "edge_runs.jsonl"
    output_path = tmp_path / "edge_defaults.json"

    payload = {
        "device": "Pixel QA",
        "os": "Android 15",
        "appVersion": "0.1.0",
        "platform": "android",
        "runtime": "tflite",
        "inputSize": 320,
        "quant": "int8",
        "threads": 4,
        "delegate": "nnapi",
        "fps": 52.0,
        "p95": 34.0,
        "batteryDelta": 0.5,
        "ts": "2024-01-01T00:00:00Z",
    }
    runs_path.write_text(json.dumps(payload) + "\n", encoding="utf-8")

    defaults = recommend_defaults(runs_path, output_path, recent=10)

    assert output_path.exists()
    written = json.loads(output_path.read_text(encoding="utf-8"))
    assert written == defaults
    assert defaults == {
        "android": {
            "runtime": "tflite",
            "inputSize": 320,
            "quant": "int8",
            "threads": 4,
            "delegate": "nnapi",
        }
    }


def test_skips_dry_runs(tmp_path: Path):
    runs_path = tmp_path / "edge_runs.jsonl"
    output_path = tmp_path / "edge_defaults.json"

    dry_payload = {
        "device": "Pixel QA",
        "os": "Android",
        "appVersion": "0.1.0",
        "platform": "android",
        "runtime": "tflite",
        "inputSize": 320,
        "quant": "int8",
        "threads": 4,
        "delegate": "nnapi",
        "fps": 100.0,
        "p95": 1.0,
        "dryRun": True,
    }
    real_payload = {
        "device": "Pixel QA",
        "os": "Android",
        "appVersion": "0.1.0",
        "platform": "android",
        "runtime": "coreml",
        "inputSize": 384,
        "quant": "fp16",
        "threads": 2,
        "delegate": "gpu",
        "fps": 45.0,
        "p95": 30.0,
    }

    with runs_path.open("w", encoding="utf-8") as handle:
        handle.write(json.dumps(dry_payload) + "\n")
        handle.write(json.dumps(real_payload) + "\n")

    defaults = recommend_defaults(runs_path, output_path, recent=10)

    assert defaults == {
        "android": {
            "runtime": "coreml",
            "inputSize": 384,
            "quant": "fp16",
            "threads": 2,
            "delegate": "gpu",
        }
    }
