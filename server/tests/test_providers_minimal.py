"""Minimal coverage for provider endpoints."""

from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from server.providers.wind import WindProviderResult

from server.app import app


client = TestClient(app)


def test_wind_fields_present(monkeypatch: pytest.MonkeyPatch):
    def _fake_wind(_lat: float, _lon: float) -> WindProviderResult:
        return WindProviderResult(
            speed_mps=5.5,
            direction_from_deg=180.0,
            etag="test",
            expires_at=time.time() + 60,
        )

    monkeypatch.setattr("server.routes.providers.wind.get_wind", _fake_wind)

    response = client.get("/providers/wind", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    data = response.json()
    assert {"speed_mps", "dir_from_deg"} <= set(data.keys())


def test_elevation_fields_present():
    response = client.get("/providers/elevation", params={"lat": 59.3, "lon": 18.1})
    assert response.status_code == 200
    assert "elevation_m" in response.json()
