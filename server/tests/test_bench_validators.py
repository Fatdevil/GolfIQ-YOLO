from datetime import datetime, timezone

import pytest

from server.routes.bench import EdgeBenchRun


def _base_payload(**overrides):
    data = {
        "device": "Pixel 7",
        "os": "Android 14",
        "appVersion": "1.0.0",
        "platform": "android",
        "runtime": "gpu",
        "inputSize": 224,
        "quant": "int8",
        "threads": 2,
        "fps": 42.5,
        "p95": 2.1,
        "dryRun": False,
    }
    data.update(overrides)
    return data


def test_platform_requires_string():
    with pytest.raises(Exception):
        EdgeBenchRun(**_base_payload(platform=123))

    with pytest.raises(Exception):
        EdgeBenchRun(**_base_payload(platform="windows"))


def test_runtime_requires_string():
    with pytest.raises(Exception):
        EdgeBenchRun(**_base_payload(runtime=123))


def test_delegate_normalization():
    run = EdgeBenchRun(**_base_payload(delegate="  TPU  "))
    assert run.delegate == "tpu"

    run = EdgeBenchRun(**_base_payload(delegate=None))
    assert run.delegate is None

    with pytest.raises(Exception):
        EdgeBenchRun(**_base_payload(delegate=123))


def test_timestamp_defaults_to_utc():
    run = EdgeBenchRun(**_base_payload(ts=None))
    assert run.ts.tzinfo is timezone.utc

    naive = datetime(2024, 1, 2, 12, 0, 0)
    run_naive = EdgeBenchRun(**_base_payload(ts=naive))
    assert run_naive.ts.tzinfo is timezone.utc
    assert run_naive.ts.hour == naive.hour
