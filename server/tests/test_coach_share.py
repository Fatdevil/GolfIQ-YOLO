import importlib

import pytest
from fastapi.testclient import TestClient

from server.schemas.coach_summary import CoachRoundSummary
from server.services.shortlinks import _reset_state as reset_shortlinks


@pytest.fixture(autouse=True)
def reset_state(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("API_KEY", "primary")
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("GOLFIQ_PRO_API_KEYS", "pro-key")
    reset_shortlinks()
    yield
    reset_shortlinks()


def _build_client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    from server.api.routers import coach as coach_router

    monkeypatch.setattr(
        coach_router,
        "build_coach_summary_for_run",
        lambda run_id, _api_key=None: CoachRoundSummary(
            run_id=run_id, sg_by_category=[], sg_per_hole=[]
        ),
    )

    import server.app as fastapi_app

    importlib.reload(fastapi_app)
    return TestClient(fastapi_app.app, raise_server_exceptions=False)


def test_create_coach_share_returns_shortlink(monkeypatch: pytest.MonkeyPatch):
    client = _build_client(monkeypatch)

    response = client.post("/api/coach/share/run-123", headers={"x-api-key": "pro-key"})

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["sid"]
    assert payload["url"] == f"{client.base_url}/s/{payload['sid']}"

    share = client.get(f"/api/share/{payload['sid']}")
    assert share.status_code == 200
    body = share.json()
    assert body["kind"] == "coach_round_summary"
    assert body["summary"]["run_id"] == "run-123"


def test_create_coach_share_enforces_pro(monkeypatch: pytest.MonkeyPatch):
    client = _build_client(monkeypatch)

    response = client.post("/api/coach/share/run-123", headers={"x-api-key": "primary"})

    assert response.status_code == 403
