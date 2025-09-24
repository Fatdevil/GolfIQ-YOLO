import pytest

from server.services.caddie_core import telemetry


class FakeMetric:
    def __init__(self):
        self.calls = []

    def labels(self, **labels):
        self.calls.append(labels)
        return self

    def observe(self, value):
        self.calls.append({"observe": value})

    def inc(self):
        self.calls.append({"inc": 1})


def test_record_recommendation_metrics_observes_histogram_and_counter(monkeypatch):
    histogram = FakeMetric()
    counter = FakeMetric()
    factors_histogram = FakeMetric()

    monkeypatch.setattr(telemetry, "_inference_histogram", histogram, raising=False)
    monkeypatch.setattr(telemetry, "_request_counter", counter, raising=False)
    monkeypatch.setattr(
        telemetry, "_factors_histogram", factors_histogram, raising=False
    )

    telemetry.record_recommendation_metrics(
        duration_ms=32.5,
        scenario="range",
        confidence="high",
        factors_count=3,
    )

    assert histogram.calls[0]["scenario"] == "range"
    assert histogram.calls[0]["confidence"] == "high"
    assert histogram.calls[1]["observe"] == pytest.approx(32.5)

    assert counter.calls[0]["scenario"] == "range"
    assert counter.calls[0]["confidence"] == "high"
    assert counter.calls[1]["inc"] == 1

    assert factors_histogram.calls[0]["scenario"] == "range"
    assert factors_histogram.calls[0]["confidence"] == "high"
    assert factors_histogram.calls[1]["observe"] == 3


def test_build_structured_log_payload_includes_build_info(monkeypatch):
    monkeypatch.setenv("BUILD_VERSION", "v1.2.3")
    monkeypatch.setenv("GIT_SHA", "abc1234")

    payload = telemetry.build_structured_log_payload(
        telemetry_id="cad-1",
        recommendation={"club": "7i", "confidence": "medium"},
        explain_score=[{"name": "target_gap", "weight": 0.4, "direction": "positive"}],
    )

    assert payload["telemetry_id"] == "cad-1"
    assert payload["build_version"] == "v1.2.3"
    assert payload["git_sha"] == "abc1234"
    assert payload["explain_score"][0]["name"] == "target_gap"
