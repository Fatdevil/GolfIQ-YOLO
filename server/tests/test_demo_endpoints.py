from fastapi.testclient import TestClient

from server.app import app

client = TestClient(app)


def test_demo_round_returns_fixed_payload() -> None:
    response = client.get("/api/demo/round")

    assert response.status_code == 200
    payload = response.json()
    assert payload["roundId"] == "demo-round"
    assert payload["courseName"]
    assert payload["categories"]
    assert payload["focusHints"]


def test_demo_weekly_returns_fixed_payload() -> None:
    response = client.get("/api/demo/weekly")

    assert response.status_code == 200
    payload = response.json()
    assert payload["period"]["roundCount"] >= 1
    assert payload["headline"]["text"]
    assert payload["categories"]


def test_demo_coach_round_returns_fixed_payload() -> None:
    response = client.get("/api/demo/coach/round")

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == "demo-round"
    assert payload["sg_by_category"]
    assert payload["sg_per_hole"]
