from __future__ import annotations

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from server.api.routers import coach_feedback


app = FastAPI()
app.include_router(coach_feedback.router)


def make_client() -> TestClient:
    return TestClient(app)


def setup_function() -> None:
    with coach_feedback._rate_lock:  # type: ignore[attr-defined]
        coach_feedback._rate_buckets.clear()  # type: ignore[attr-defined]


def test_request_requires_identifier() -> None:
    with make_client() as client:
        resp = client.post("/coach/feedback", json={})
        assert resp.status_code == 422


def test_run_id_not_found_returns_404(monkeypatch) -> None:
    monkeypatch.setattr(coach_feedback, "load_run", lambda run_id: None)

    with make_client() as client:
        resp = client.post("/coach/feedback", json={"run_id": "1234567890-abcd1234"})
        assert resp.status_code == 404


def test_metrics_list_rejected_by_validation(monkeypatch) -> None:
    class Run:
        metrics = {"ballSpeedMps": 60}

    monkeypatch.setattr(coach_feedback, "load_run", lambda run_id: Run())
    monkeypatch.setattr(
        coach_feedback,
        "generate_feedback",
        lambda metrics: {"text": "ok", "provider": "mock", "latency_ms": 1},
    )

    with make_client() as client:
        resp = client.post(
            "/coach/feedback",
            json={"run_id": "1234567890-abcd1234", "metrics": []},
        )
        assert resp.status_code == 422


@pytest.mark.anyio
async def test_handler_raises_400_for_non_dict_metrics(monkeypatch) -> None:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/coach/feedback",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    request = Request(scope)
    body = coach_feedback.CoachFeedbackRequest.model_construct(metrics="bad")

    monkeypatch.setattr(coach_feedback, "load_run", lambda run_id: None)
    monkeypatch.setattr(
        coach_feedback,
        "generate_feedback",
        lambda metrics: {"text": "ok", "provider": "mock", "latency_ms": 1},
    )

    with pytest.raises(HTTPException) as exc:
        await coach_feedback.coach_feedback(request, body)

    assert exc.value.status_code == 400


def test_successful_request_merges_metrics(monkeypatch) -> None:
    class Run:
        metrics = {"ballSpeedMps": 60, "quality": {"tempo": "stable"}}

    monkeypatch.setattr(coach_feedback, "load_run", lambda run_id: Run())

    captured = {}

    def fake_generate(metrics):
        captured.update(metrics)
        return {"text": "ok", "provider": "mock", "latency_ms": 10}

    monkeypatch.setattr(coach_feedback, "generate_feedback", fake_generate)

    with make_client() as client:
        resp = client.post(
            "/coach/feedback",
            json={"run_id": "1234567890-abcd1234", "metrics": {"carryEstM": 150}},
        )
        assert resp.status_code == 200, resp.text
        assert captured == {
            "ballSpeedMps": 60,
            "quality": {"tempo": "stable"},
            "carryEstM": 150,
        }
        assert resp.json() == {"text": "ok", "provider": "mock", "latency_ms": 10}


def test_rate_limit_returns_429(monkeypatch) -> None:
    monkeypatch.setattr(
        coach_feedback,
        "generate_feedback",
        lambda metrics: {"text": "ok", "provider": "mock", "latency_ms": 1},
    )

    with make_client() as client:
        for _ in range(coach_feedback._RATE_LIMIT_MAX_REQUESTS):  # type: ignore[attr-defined]
            resp = client.post(
                "/coach/feedback",
                json={"metrics": {"ballSpeedMps": 50}},
            )
            assert resp.status_code == 200

        resp = client.post(
            "/coach/feedback",
            json={"metrics": {"ballSpeedMps": 55}},
        )
        assert resp.status_code == 429
