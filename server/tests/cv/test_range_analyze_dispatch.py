from __future__ import annotations

from server.cv import range_analyze
from server.cv.range_analyze import CameraFitness, RangeAnalyzeIn, RangeAnalyzeOut


def test_run_range_analyze_uses_mock(monkeypatch) -> None:
    payload = RangeAnalyzeIn(frames=4, fps=120.0, ref_len_m=1.0, ref_len_px=100.0)
    called = {}

    def fake_get_backend() -> range_analyze.CvBackend:
        return range_analyze.CvBackend.MOCK

    def fake_mock(inner: RangeAnalyzeIn) -> RangeAnalyzeOut:
        called["mock"] = inner
        return RangeAnalyzeOut(ball_speed_mps=17.5)

    def fake_real(inner: RangeAnalyzeIn) -> RangeAnalyzeOut:  # pragma: no cover - guard
        raise AssertionError("real backend should not be called when mock is active")

    monkeypatch.setattr(range_analyze, "get_range_backend", fake_get_backend)
    monkeypatch.setattr(range_analyze, "run_mock_analyze", fake_mock)
    monkeypatch.setattr(range_analyze, "run_real_analyze", fake_real)

    result = range_analyze.run_range_analyze(payload)

    assert result.ball_speed_mps == 17.5
    assert "mock" in called


def test_run_range_analyze_uses_real(monkeypatch) -> None:
    payload = RangeAnalyzeIn(frames=4, fps=120.0, ref_len_m=1.0, ref_len_px=100.0)
    called = {}

    def fake_get_backend() -> range_analyze.CvBackend:
        return range_analyze.CvBackend.REAL

    def fake_mock(inner: RangeAnalyzeIn) -> RangeAnalyzeOut:  # pragma: no cover - guard
        raise AssertionError("mock backend should not be called when real is active")

    def fake_real(inner: RangeAnalyzeIn) -> RangeAnalyzeOut:
        called["real"] = inner
        return RangeAnalyzeOut(
            ball_speed_mps=28.2,
            quality=CameraFitness(score=0.9, level="good", reasons=[]),
        )

    monkeypatch.setattr(range_analyze, "get_range_backend", fake_get_backend)
    monkeypatch.setattr(range_analyze, "run_mock_analyze", fake_mock)
    monkeypatch.setattr(range_analyze, "run_real_analyze", fake_real)

    result = range_analyze.run_range_analyze(payload)

    assert result.ball_speed_mps == 28.2
    assert result.quality and result.quality.level == "good"
    assert "real" in called
