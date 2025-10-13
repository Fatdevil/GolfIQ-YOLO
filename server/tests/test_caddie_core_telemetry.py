from __future__ import annotations

from server.services.caddie_core import telemetry


def test_build_structured_log_payload_includes_duration_when_present(monkeypatch) -> None:
    monkeypatch.setenv("BUILD_VERSION", "1.2.3")
    monkeypatch.setenv("GIT_SHA", "abc123")
    payload = telemetry.build_structured_log_payload(
        telemetry_id="tid",
        recommendation={"club": "7i"},
        explain_score=[{"name": "target_gap"}],
        duration_ms=42.0,
    )
    assert payload["duration_ms"] == 42.0
    assert payload["build_version"] == "1.2.3"
    assert payload["git_sha"] == "abc123"


def test_record_recommendation_metrics_invokes_prometheus(monkeypatch) -> None:
    observed = []

    class DummyMetric:
        def __init__(self, name: str) -> None:
            self._name = name

        def observe(self, value: float) -> None:
            observed.append((self._name, value))

        def inc(self) -> None:
            observed.append((self._name, "inc"))

    def fake_labels(*, scenario: str, confidence: str):
        metric_name = f"{scenario}:{confidence}"
        if scenario == "range" and confidence == "high":
            return DummyMetric(metric_name)
        return DummyMetric(metric_name)

    monkeypatch.setattr(telemetry._inference_histogram, "labels", fake_labels)
    monkeypatch.setattr(telemetry._inference_histogram_compat, "labels", fake_labels)

    class DummyCounter(DummyMetric):
        pass

    monkeypatch.setattr(telemetry._request_counter, "labels", fake_labels)
    monkeypatch.setattr(telemetry._factors_histogram, "labels", fake_labels)

    telemetry.record_recommendation_metrics(
        duration_ms=12.5,
        scenario="range",
        confidence="high",
        factors_count=3,
    )

    assert ("range:high", 12.5) in observed
    assert ("range:high", "inc") in observed
