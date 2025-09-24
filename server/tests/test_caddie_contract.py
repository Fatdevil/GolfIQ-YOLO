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


def test_post_caddie_recommend_accepts_valid_payload(client):
    payload = load_example("range_request.json")

    response = client.post("/caddie/recommend", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert "recommendation" in body
    assert "explain_score" in body
    assert len(body["explain_score"]) == 3


def test_post_caddie_recommend_requires_minimum_shot_samples(client):
    payload = load_example("range_request.json")
    payload["shot_samples"] = payload["shot_samples"][:10]

    response = client.post("/caddie/recommend", json=payload)

    assert response.status_code == 422
    body = response.json()
    assert body["error_code"] == "validation_error"
