from __future__ import annotations

import json
from pathlib import Path

from scripts.edge_recommend import (
    EdgeRun,
    _coerce_float,
    _is_truthy,
    _score_key,
    compute_recommendations,
    load_recent_runs,
    main,
    recommend_defaults,
    _parse_args,
)


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


def test_helper_utilities_cover_edge_cases(tmp_path: Path):
    truthy_inputs = [True, 1, 2.0, "true", " Yes "]
    falsy_inputs = [False, 0, 0.0, "", "no", None]

    for value in truthy_inputs:
        assert _is_truthy(value)

    for value in falsy_inputs:
        assert not _is_truthy(value)

    assert _coerce_float("3.14") == 3.14
    assert _coerce_float("not-a-number") is None

    key_with_missing_metrics = _score_key(
        runtime="tflite",
        input_size=416,
        quant="int8",
        threads=4,
        delegate=None,
        p95=None,
        fps=None,
        battery=None,
    )
    assert key_with_missing_metrics[0] == float("inf")
    assert key_with_missing_metrics[1] == -0.0
    assert key_with_missing_metrics[2] == float("inf")

    runs_file = tmp_path / "runs.jsonl"
    runs_file.write_text(
        "\n".join(
            [
                "",  # blank line should be skipped
                "{",  # invalid JSON should be ignored
                json.dumps({"dryRun": True}),  # dry run ignored
                json.dumps(
                    {
                        "platform": "ios",
                        "runtime": "coreml",
                        "inputSize": 384,
                        "quant": "fp16",
                        "threads": 2,
                        "fps": 58.0,
                        "p95": 27.0,
                    }
                ),
            ]
        ),
        encoding="utf-8",
    )

    loaded = load_recent_runs(runs_file, limit=5)
    assert len(loaded) == 1
    assert loaded[0].platform == "ios"


def test_parse_args_uses_defaults(tmp_path: Path, monkeypatch):
    # ensure environment defaults don't leak from the real repo
    monkeypatch.chdir(tmp_path)

    args = _parse_args([])
    # when invoked with no overrides the defaults should point to the repo constants
    # (they resolve relative to the script location, not cwd)
    assert args.recent > 0
    assert args.runs.name == "edge_runs.jsonl"
    assert args.output.name == "edge_defaults.json"


def test_main_cli_flow(tmp_path: Path, capsys):
    runs_path = tmp_path / "edge_runs.jsonl"
    output_path = tmp_path / "edge_defaults.json"

    payload = {
        "platform": "android",
        "runtime": "tflite",
        "inputSize": 320,
        "quant": "int8",
        "threads": 4,
        "delegate": "nnapi",
        "fps": 30.0,
        "p95": 50.0,
    }
    runs_path.write_text(json.dumps(payload) + "\n", encoding="utf-8")

    main(
        [
            "--runs",
            str(runs_path),
            "--output",
            str(output_path),
            "--recent",
            "5",
        ]
    )

    assert output_path.exists()
    written = json.loads(output_path.read_text(encoding="utf-8"))
    captured = capsys.readouterr().out.strip()
    assert json.loads(captured) == written
