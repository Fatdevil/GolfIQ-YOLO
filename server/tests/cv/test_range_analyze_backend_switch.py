from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.cv.range_analyze import CameraFitness, RangeAnalyzeIn, RangeAnalyzeOut


def _make_client() -> TestClient:
    return TestClient(app)


def test_range_analyze_uses_mock_backend_by_default(monkeypatch) -> None:
    calls: list[RangeAnalyzeIn] = []

    def fake_mock(payload: RangeAnalyzeIn) -> RangeAnalyzeOut:
        calls.append(payload)
        return RangeAnalyzeOut(ball_speed_mps=15.0)

    monkeypatch.setattr("server.cv.range_analyze.run_mock_analyze", fake_mock)
    monkeypatch.delenv("RANGE_PRACTICE_CV_BACKEND", raising=False)

    with _make_client() as client:
        response = client.post(
            "/range/practice/analyze", json={"frames": 6, "fps": 90.0}
        )

    assert response.status_code == 200
    assert calls, "mock backend should have been invoked"
    assert response.json()["ball_speed_mps"] == 15.0


def test_range_analyze_uses_real_backend_when_configured(monkeypatch) -> None:
    calls: list[RangeAnalyzeIn] = []

    def fake_real(payload: RangeAnalyzeIn) -> RangeAnalyzeOut:
        calls.append(payload)
        return RangeAnalyzeOut(
            ball_speed_mps=42.0,
            quality=CameraFitness(score=0.55, level="warning", reasons=["fps_low"]),
        )

    monkeypatch.setenv("RANGE_PRACTICE_CV_BACKEND", "real")
    monkeypatch.setattr("server.cv.range_analyze.run_real_analyze", fake_real)

    with _make_client() as client:
        response = client.post(
            "/range/practice/analyze", json={"frames": 6, "fps": 90.0}
        )

    assert response.status_code == 200
    assert calls, "real backend should have been invoked"
    payload = response.json()
    assert payload["ball_speed_mps"] == 42.0
    assert payload["quality"]["level"] == "warning"
    assert payload["quality"]["reasons"] == ["fps_low"]
