"""Minimal coverage for provider endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from server.app import app


client = TestClient(app)


def test_wind_fields_present():
    response = client.get("/providers/wind", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    data = response.json()
    assert {"speed_mps", "dir_from_deg"} <= set(data.keys())


def test_elevation_fields_present():
    response = client.get("/providers/elevation", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    assert "elevation_m" in response.json()
