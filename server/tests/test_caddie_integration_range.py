import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server import app as fastapi_app


@pytest.fixture(scope="module")
def client():
    return TestClient(fastapi_app.app)


def load_example(name: str) -> dict:
    example_path = Path("specs/001-feature-caddiecore-v1/contracts/examples") / name
    with example_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def test_range_scenario_returns_recommendation(client):
    payload = load_example("range_request.json")

    response = client.post("/caddie/recommend", json=payload)

    assert response.status_code == 200
    body = response.json()

    assert body["recommendation"]["club"]
    assert body["recommendation"]["confidence"] in {"low", "medium", "high"}
    assert isinstance(body["explain_score"], list) and len(body["explain_score"]) == 3
    assert "telemetry_id" in body
