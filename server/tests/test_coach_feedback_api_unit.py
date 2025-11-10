import asyncio
from collections import deque
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from server.api.routers import coach_feedback


@pytest.fixture(autouse=True)
def reset_rate_limit():
    coach_feedback._rate_buckets.clear()
    yield
    coach_feedback._rate_buckets.clear()


def test_rate_limit_evicts_old_entries(monkeypatch):
    monkeypatch.setattr(coach_feedback.time, "monotonic", lambda: 1000.0)
    bucket = deque([900.0])
    coach_feedback._rate_buckets["1.1.1.1"] = bucket

    coach_feedback._rate_limit("1.1.1.1")
    assert len(bucket) == 1
    assert bucket[0] == 1000.0


def test_rate_limit_blocks_when_threshold_exceeded(monkeypatch):
    monkeypatch.setattr(coach_feedback.time, "monotonic", lambda: 2000.0)
    bucket = deque([1990.0, 1991.0, 1992.0, 1993.0, 1994.0])
    coach_feedback._rate_buckets["2.2.2.2"] = bucket

    with pytest.raises(HTTPException) as excinfo:
        coach_feedback._rate_limit("2.2.2.2")
    assert excinfo.value.status_code == 429


def test_coach_feedback_merges_metrics(monkeypatch):
    request = SimpleNamespace(client=SimpleNamespace(host="3.3.3.3"))
    record = SimpleNamespace(metrics={"baseline": 1.0})

    monkeypatch.setattr(coach_feedback, "load_run", lambda run_id: record)
    monkeypatch.setattr(
        coach_feedback,
        "generate_feedback",
        lambda metrics: {
            "text": f"ok:{metrics['baseline']}",
            "provider": "mock",
            "latency_ms": 5,
        },
    )

    body = coach_feedback.CoachFeedbackRequest(run_id="run-1", metrics={"extra": 2})
    response = asyncio.run(coach_feedback.coach_feedback(request, body))
    assert response.text.startswith("ok:")


def test_coach_feedback_rejects_non_dict_metrics(monkeypatch):
    request = SimpleNamespace(client=SimpleNamespace(host="4.4.4.4"))
    monkeypatch.setattr(coach_feedback, "load_run", lambda run_id: None)

    body = coach_feedback.CoachFeedbackRequest.model_construct(
        run_id=None, metrics="invalid"
    )
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(coach_feedback.coach_feedback(request, body))
    assert excinfo.value.status_code == 400
    assert "metrics must be an object" in excinfo.value.detail
