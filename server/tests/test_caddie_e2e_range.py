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


def test_range_scenario_end_to_end(client):
    payload = load_example_request()

    response = client.post("/caddie/recommend", json=payload)

    assert response.status_code == 200
    body = response.json()

    assert body["recommendation"]["club"]
    assert body["recommendation"]["confidence"] in {"low", "medium", "high"}
    assert len(body["explain_score"]) == 3

    metrics_response = client.get("/metrics")
    assert metrics_response.status_code == 200
    text = metrics_response.text
    assert "caddie_recommend_inference_ms" in text
