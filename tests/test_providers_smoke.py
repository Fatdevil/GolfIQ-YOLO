from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.providers import cache, elevation, wind
from server.providers.elevation import ELEVATION_CACHE_TTL
from server.providers.wind import WIND_CACHE_TTL
from server.routes.providers import router as providers_router


def _make_client_factory(handler: Callable[[httpx.Request], httpx.Response]) -> Callable[..., httpx.Client]:
    """Return a factory that yields an httpx client using the provided handler."""

    def factory(**kwargs: Any) -> httpx.Client:
        transport = httpx.MockTransport(handler)
        timeout = kwargs.get("timeout", 10.0)
        return httpx.Client(transport=transport, timeout=timeout)

    return factory


@pytest.fixture(autouse=True)
def _reset_provider_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_PROVIDER_CACHE_DIR", str(tmp_path))
    elevation._cache = cache.ProviderCache("smoke-elevation", ELEVATION_CACHE_TTL)
    wind._cache = cache.ProviderCache("smoke-wind", WIND_CACHE_TTL)
    yield


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(providers_router)
    with TestClient(app) as test_client:
        yield test_client


def test_elevation_endpoint_caches_and_sets_headers(monkeypatch, client):
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert request.url.params.get("latitude") == "1.23456"
        assert request.url.params.get("longitude") == "-2.34567"
        return httpx.Response(200, json={"elevation": [321.0]})

    monkeypatch.setattr(elevation, "_http_client_factory", _make_client_factory(handler))

    response = client.get("/providers/elevation", params={"lat": 1.23456, "lon": -2.34567})
    assert response.status_code == 200
    data = response.json()
    assert data["elevation_m"] == pytest.approx(321.0)
    assert 0 < data["ttl_s"] <= ELEVATION_CACHE_TTL
    etag = data["etag"]
    assert etag
    assert response.headers["ETag"].strip('"') == etag
    assert response.headers["Cache-Control"].startswith("public, max-age=")
    assert calls == 1

    cached = client.get("/providers/elevation", params={"lat": 1.23456, "lon": -2.34567})
    assert cached.status_code == 200
    cached_data = cached.json()
    assert cached_data["elevation_m"] == pytest.approx(321.0)
    assert cached_data["etag"] == etag
    assert 0 < cached_data["ttl_s"] <= data["ttl_s"]
    assert calls == 1  # cache hit – no extra HTTP call

    conditional = client.get(
        "/providers/elevation",
        params={"lat": 1.23456, "lon": -2.34567},
        headers={"If-None-Match": etag},
    )
    assert conditional.status_code == 304
    assert conditional.content == b""
    assert conditional.headers["ETag"].strip('"') == etag
    assert conditional.headers["Cache-Control"].startswith("public, max-age=")
    assert calls == 1


def test_wind_endpoint_caches_and_computes_components(monkeypatch, client):
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        payload = {
            "hourly": {
                "time": ["2024-01-01T00:00", "2024-01-01T01:00"],
                "wind_speed_10m": [10.0, 12.0],
                "wind_direction_10m": [180.0, 210.0],
            }
        }
        return httpx.Response(200, json=payload)

    monkeypatch.setattr(wind, "_http_client_factory", _make_client_factory(handler))
    monkeypatch.setattr(
        wind,
        "_now",
        lambda: datetime(2024, 1, 1, 0, 30, tzinfo=timezone.utc),
    )

    response = client.get(
        "/providers/wind",
        params={"lat": 40.75, "lon": -73.97, "bearing": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["speed_mps"] == pytest.approx(10.0)
    assert data["dir_from_deg"] == pytest.approx(180.0)
    assert data["w_parallel"] == pytest.approx(10.0)
    assert data["w_perp"] == pytest.approx(0.0, abs=1e-6)
    assert 0 < data["ttl_s"] <= WIND_CACHE_TTL
    etag = data["etag"]
    assert etag
    assert response.headers["ETag"].strip('"') == etag
    assert response.headers["Cache-Control"].startswith("public, max-age=")
    assert calls == 1

    cached = client.get(
        "/providers/wind",
        params={"lat": 40.75, "lon": -73.97, "bearing": 0},
    )
    assert cached.status_code == 200
    cached_data = cached.json()
    assert cached_data["speed_mps"] == pytest.approx(10.0)
    assert cached_data["dir_from_deg"] == pytest.approx(180.0)
    assert cached_data["w_parallel"] == pytest.approx(10.0)
    assert cached_data["etag"] == etag
    assert 0 < cached_data["ttl_s"] <= data["ttl_s"]
    assert calls == 1

    conditional = client.get(
        "/providers/wind",
        params={"lat": 40.75, "lon": -73.97, "bearing": 0},
        headers={"If-None-Match": etag},
    )
    assert conditional.status_code == 304
    assert conditional.content == b""
    assert conditional.headers["ETag"].strip('"') == etag
    assert conditional.headers["Cache-Control"].startswith("public, max-age=")
    assert calls == 1
