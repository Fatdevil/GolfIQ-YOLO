from fastapi.testclient import TestClient

from server.app import app
from server.api.routers import practice as practice_router
from server.api.routers.summary import WeeklySummary

client = TestClient(app)


def test_list_drills_returns_catalog():
    response = client.get("/api/coach/drills")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list) and len(data) > 0
    assert set(data[0].keys()) >= {
        "id",
        "name",
        "description",
        "category",
        "focusMetric",
        "difficulty",
        "durationMinutes",
        "recommendedBalls",
    }


def test_practice_plan_endpoint_uses_weekly(monkeypatch):
    payload = {
        "period": {"from": "2025-01-01", "to": "2025-01-07", "roundCount": 3},
        "headline": {"text": "", "emoji": ""},
        "coreStats": {
            "avgScore": 72,
            "bestScore": 70,
            "worstScore": 75,
            "avgToPar": "+1",
            "holesPlayed": 54,
        },
        "categories": {
            "driving": {"grade": "B", "trend": "flat", "note": None},
            "putting": {"grade": "D", "trend": "down", "note": None},
        },
        "focusHints": ["Lag putting"],
        "strokesGained": {
            "total": -0.5,
            "categories": {
                "driving": {"value": 0.1, "grade": "B", "label": "Driving"},
                "putting": {"value": -1.0, "grade": "D", "label": "Putting"},
            },
        },
    }

    weekly = WeeklySummary.model_validate(payload)

    async def fake_load_weekly_summary(*, service, player_id, now):
        return weekly

    monkeypatch.setattr(
        practice_router, "_load_weekly_summary", fake_load_weekly_summary
    )

    response = client.get("/api/coach/practice/plan?max_minutes=45")
    assert response.status_code == 200
    body = response.json()
    assert "focusCategories" in body and "putting" in body["focusCategories"]
    assert body["drills"]
