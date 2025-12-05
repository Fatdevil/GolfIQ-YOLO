from __future__ import annotations

import importlib

from fastapi.testclient import TestClient


def test_plan_from_drills_endpoint(monkeypatch):
    monkeypatch.setenv("REQUIRE_API_KEY", "1")
    monkeypatch.setenv("API_KEY", "demo-key")

    import server.app as fastapi_app

    importlib.reload(fastapi_app)

    client = TestClient(fastapi_app.app, raise_server_exceptions=False)

    response = client.post(
        "/api/coach/practice/plan-from-drills",
        headers={"x-api-key": "demo-key"},
        json={"drillIds": ["lag-putt-ladders", "pressure-3-footers"], "maxMinutes": 30},
    )

    assert response.status_code == 200
    data = response.json()
    drill_ids = [drill.get("id") for drill in data.get("drills", [])]
    assert drill_ids
    assert drill_ids[0] == "lag-putt-ladders"
    assert set(drill_ids).issubset({"lag-putt-ladders", "pressure-3-footers"})
