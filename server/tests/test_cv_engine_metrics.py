from __future__ import annotations

from server.metrics import cv_engine


def test_observe_stage_latency_skips_negative(monkeypatch) -> None:
    observed: list[float] = []

    class DummyObserver:
        def observe(self, value: float) -> None:
            observed.append(value)

    def fake_labels(*, stage: str):
        assert stage == "stage"
        return DummyObserver()

    monkeypatch.setattr(cv_engine.CV_STAGE_LATENCY_MS, "labels", fake_labels)

    cv_engine.observe_stage_latency("stage", -5)
    assert observed == []

    cv_engine.observe_stage_latency("stage", 12.5)
    assert observed == [12.5]
