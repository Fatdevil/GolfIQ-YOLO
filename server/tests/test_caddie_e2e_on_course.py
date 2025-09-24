import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server import app as fastapi_app


@pytest.fixture(scope="module")
def client():
    return TestClient(fastapi_app.app)


def load_example_request() -> dict:
    example_path = Path(
        "specs/001-feature-caddiecore-v1/contracts/examples/range_request.json"
    )
    with example_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def test_on_course_scenario_with_hazard_trigger(client):
    payload = load_example_request()
    payload["scenario"] = "on_course"
    payload["target"]["hazard_distance_m"] = 140

    response = client.post("/caddie/recommend", json=payload)

    assert response.status_code == 200
    body = response.json()

    recommendation = body["recommendation"]
    assert recommendation["hazard_flag"] is True
    assert recommendation["conservative_club"]
    assert recommendation["safety_margin_m"] >= 0

    factors = [factor["name"] for factor in body["explain_score"]]
    assert "dispersion_margin" in factors or "hazard_margin" in factors

    metrics_response = client.get("/metrics")
    assert metrics_response.status_code == 200
    metrics_text = metrics_response.text
    assert "caddie_recommend_factors_count" in metrics_text
