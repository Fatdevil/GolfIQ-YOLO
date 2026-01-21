from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app
from server.utils.schema_validate import validate_ux_payload_v1


def _make_client(**kwargs) -> TestClient:
    return TestClient(app, **kwargs)


def _assert_tips_capped(payload: dict[str, object]) -> None:
    coach = payload.get("coach")
    if not isinstance(coach, dict):
        return
    tips = coach.get("tips")
    if isinstance(tips, list):
        assert len(tips) <= 3


def test_cv_analyze_demo_returns_swing_ux_payload() -> None:
    files = {"frames_zip": ("frames.zip", b"demo", "application/zip")}
    with _make_client() as client:
        resp = client.post("/cv/analyze?demo=true", files=files)

    assert resp.status_code == 200
    body = resp.json()
    assert body["ux_payload_v1"]["mode"] == "swing"
    validate_ux_payload_v1(body["ux_payload_v1"])
    _assert_tips_capped(body["ux_payload_v1"])
    assert body["summary"] == "demo mode: synthetic swing analysis"


def test_range_analyze_demo_returns_range_ux_payload() -> None:
    with _make_client() as client:
        resp = client.post("/range/practice/analyze", json={"frames": 8, "demo": True})

    assert resp.status_code == 200
    body = resp.json()
    assert body["ux_payload_v1"]["mode"] == "range"
    validate_ux_payload_v1(body["ux_payload_v1"])
    _assert_tips_capped(body["ux_payload_v1"])


def test_demo_mode_is_deterministic_for_cv_analyze() -> None:
    files = {"frames_zip": ("frames.zip", b"demo", "application/zip")}
    with _make_client() as client:
        first = client.post("/cv/analyze?demo=1", files=files)
        second = client.post("/cv/analyze?demo=1", files=files)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["ux_payload_v1"] == second.json()["ux_payload_v1"]
    validate_ux_payload_v1(first.json()["ux_payload_v1"])


def test_demo_mode_is_deterministic_for_range_analyze() -> None:
    with _make_client() as client:
        first = client.post("/range/practice/analyze", json={"frames": 8, "demo": True})
        second = client.post(
            "/range/practice/analyze", json={"frames": 8, "demo": True}
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["ux_payload_v1"] == second.json()["ux_payload_v1"]
    validate_ux_payload_v1(first.json()["ux_payload_v1"])


def test_demo_mode_ignores_model_variant_env(monkeypatch) -> None:
    monkeypatch.setenv("MODEL_VARIANT", "yolov11")
    files = {"frames_zip": ("frames.zip", b"demo", "application/zip")}
    with _make_client() as client:
        resp = client.post("/cv/analyze?demo=true", files=files)

    assert resp.status_code == 200
    assert resp.json()["ux_payload_v1"]["mode"] == "swing"
