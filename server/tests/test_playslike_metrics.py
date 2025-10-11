from __future__ import annotations

from typing import Iterable

import pytest
from prometheus_client.metrics import Histogram

from server.metrics import playslike_metrics as metrics


@pytest.fixture(autouse=True)
def reset_metrics() -> Iterable[None]:
    metrics.PLAYSLIKE_TEMPALT_APPLIED_TOTAL._value.set(0)
    for histogram in (
        metrics.PLAYSLIKE_TEMPALT_DELTA_M,
        metrics.PLAYSLIKE_TEMP_DELTA_M,
        metrics.PLAYSLIKE_ALT_DELTA_M,
    ):
        histogram._sum.set(0)
        for bucket in histogram._buckets:
            bucket.set(0)
    yield
    metrics.PLAYSLIKE_TEMPALT_APPLIED_TOTAL._value.set(0)
    for histogram in (
        metrics.PLAYSLIKE_TEMPALT_DELTA_M,
        metrics.PLAYSLIKE_TEMP_DELTA_M,
        metrics.PLAYSLIKE_ALT_DELTA_M,
    ):
        histogram._sum.set(0)
        for bucket in histogram._buckets:
            bucket.set(0)


def _histogram_count_and_total(histogram: Histogram) -> tuple[int, float]:
    collected = histogram.collect()
    assert collected, "Histogram did not produce any samples"
    samples = collected[0].samples
    count = next(sample.value for sample in samples if sample.name.endswith("_count"))
    total = next(sample.value for sample in samples if sample.name.endswith("_sum"))
    return int(count), float(total)


def test_observe_tempalt_deltas_enabled_records_all_metrics() -> None:
    metrics.observe_tempalt_deltas(temp_delta=2.5, alt_delta=-1.0, enabled=True)

    assert metrics.PLAYSLIKE_TEMPALT_APPLIED_TOTAL._value.get() == pytest.approx(1.0)

    temp_count, temp_total = _histogram_count_and_total(metrics.PLAYSLIKE_TEMP_DELTA_M)
    alt_count, alt_total = _histogram_count_and_total(metrics.PLAYSLIKE_ALT_DELTA_M)
    combined_count, combined_total = _histogram_count_and_total(
        metrics.PLAYSLIKE_TEMPALT_DELTA_M
    )

    assert temp_total == pytest.approx(2.5)
    assert alt_total == pytest.approx(1.0)
    assert combined_total == pytest.approx(1.5)

    assert temp_count == 1
    assert alt_count == 1
    assert combined_count == 1


def test_observe_tempalt_deltas_disabled_skips_total_histogram() -> None:
    metrics.observe_tempalt_deltas(temp_delta=-0.4, alt_delta=-0.6, enabled=False)

    assert metrics.PLAYSLIKE_TEMPALT_APPLIED_TOTAL._value.get() == pytest.approx(0.0)

    temp_count, temp_total = _histogram_count_and_total(metrics.PLAYSLIKE_TEMP_DELTA_M)
    alt_count, alt_total = _histogram_count_and_total(metrics.PLAYSLIKE_ALT_DELTA_M)
    combined_count, combined_total = _histogram_count_and_total(
        metrics.PLAYSLIKE_TEMPALT_DELTA_M
    )

    assert temp_total == pytest.approx(0.4)
    assert alt_total == pytest.approx(0.6)
    assert combined_total == pytest.approx(0.0)

    assert temp_count == 1
    assert alt_count == 1
    assert combined_count == 0
