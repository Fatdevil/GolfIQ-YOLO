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


def test_on_course_hazard_returns_conservative_option(client):
    payload = load_example("range_request.json")
    payload["target"]["hazard_distance_m"] = 135
    payload["scenario"] = "on_course"

    response = client.post("/caddie/recommend", json=payload)

    assert response.status_code == 200
    body = response.json()

    assert body["recommendation"]["hazard_flag"] is True
    assert body["recommendation"]["conservative_club"]
    assert any(
        factor["name"] == "dispersion_margin" for factor in body["explain_score"]
    )
