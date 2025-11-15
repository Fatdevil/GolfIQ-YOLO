from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.cv.range_analyze import CameraFitness, RangeAnalyzeOut


def _make_client(**kwargs) -> TestClient:
    return TestClient(app, **kwargs)


def test_analyze_route_returns_payload(monkeypatch) -> None:
    fake_out = RangeAnalyzeOut(
        ball_speed_mps=31.2,
        club_speed_mps=40.1,
        quality=CameraFitness(score=0.75, level="warning", reasons=["fps_low"]),
    )

    monkeypatch.setattr(
        "server.routes.range_practice.run_range_analyze", lambda payload: fake_out
    )

    with _make_client() as client:
        response = client.post("/range/practice/analyze", json={"frames": 12})

    assert response.status_code == 200
    payload = response.json()
    assert payload["ball_speed_mps"] == 31.2
    assert payload["quality"]["level"] == "warning"
    assert payload["quality"]["reasons"] == ["fps_low"]


def test_analyze_route_validation_error() -> None:
    with _make_client() as client:
        response = client.post("/range/practice/analyze", json={"frames": 1})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any(item["loc"][-1] == "frames" for item in detail)


def test_analyze_route_handles_analyzer_failure(monkeypatch) -> None:
    def boom(payload):
        raise RuntimeError("cv analyzer exploded")

    monkeypatch.setattr("server.routes.range_practice.run_range_analyze", boom)

    with _make_client(raise_server_exceptions=False) as client:
        response = client.post("/range/practice/analyze", json={"frames": 8})

    assert response.status_code == 500
    assert "Internal Server Error" in response.text
