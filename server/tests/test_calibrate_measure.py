import pytest
from fastapi.testclient import TestClient

from server.api.main import app


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def test_calibrate_measure_endpoint(client):
    response = client.post(
        "/calibrate/measure",
        json={
            "p1x": 0.0,
            "p1y": 0.0,
            "p2x": 100.0,
            "p2y": 0.0,
            "ref_len_m": 1.0,
            "fps": 60.0,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert abs(payload["meters_per_pixel"] - 0.01) < 1e-9
    assert payload["quality"] == "low_fps"


@pytest.mark.parametrize(
    "fps,expected_quality",
    [
        (90.0, "ok_warn"),
        (140.0, "ok"),
    ],
)
def test_calibrate_measure_quality_thresholds(client, fps, expected_quality):
    response = client.post(
        "/calibrate/measure",
        json={
            "p1x": 10.0,
            "p1y": 5.0,
            "p2x": 50.0,
            "p2y": 35.0,
            "ref_len_m": 2.0,
            "fps": fps,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quality"] == expected_quality


def test_calibrate_measure_handles_zero_distance(client):
    response = client.post(
        "/calibrate/measure",
        json={
            "p1x": 33.3,
            "p1y": -10.0,
            "p2x": 33.3,
            "p2y": -10.0,
            "ref_len_m": 0.5,
            "fps": 200.0,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["meters_per_pixel"] == 0.0
    assert payload["quality"] == "ok"
