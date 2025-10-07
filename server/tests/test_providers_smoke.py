from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from server.providers import elevation as elevation_provider
from server.providers import wind as wind_provider
from server.providers.cache import ProviderCache
from server.providers.elevation import ELEVATION_CACHE_TTL
from server.providers.wind import WIND_CACHE_TTL


@pytest.fixture(autouse=True)
def _reset_caches(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_PROVIDER_CACHE_DIR", str(tmp_path))
    elevation_provider._cache = ProviderCache("test-elevation", ELEVATION_CACHE_TTL)
    wind_provider._cache = ProviderCache("test-wind", WIND_CACHE_TTL)
    yield


def _build_client(monkeypatch, elevation_transport, wind_transport, now_fn):
    monkeypatch.setattr(
        elevation_provider,
        "_http_client_factory",
        lambda **kwargs: httpx.Client(
            transport=elevation_transport, timeout=kwargs.get("timeout", 10.0)
        ),
    )
    monkeypatch.setattr(
        wind_provider,
        "_http_client_factory",
        lambda **kwargs: httpx.Client(
            transport=wind_transport, timeout=kwargs.get("timeout", 10.0)
        ),
    )
    monkeypatch.setattr(wind_provider, "_now", now_fn)

    from server.app import app

    return TestClient(app)


def test_elevation_provider_caches_and_etag(monkeypatch):
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, json={"elevation": [321.0]})

    elevation_transport = httpx.MockTransport(handler)
    wind_transport = httpx.MockTransport(lambda request: httpx.Response(500))

    client = _build_client(
        monkeypatch,
        elevation_transport=elevation_transport,
        wind_transport=wind_transport,
        now_fn=lambda: datetime.now(timezone.utc),
    )

    response = client.get(
        "/providers/elevation", params={"lat": 1.234567, "lon": 2.345678}
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["elevation_m"] == 321.0
    assert payload["ttl_s"] > 0
    etag = payload["etag"]
    assert etag
    assert calls and "open-meteo" in calls[0]

    second = client.get(
        "/providers/elevation", params={"lat": 1.234567, "lon": 2.345678}
    )
    assert second.status_code == 200
    assert second.json()["etag"] == etag
    assert len(calls) == 1

    cached = client.get(
        "/providers/elevation",
        params={"lat": 1.234567, "lon": 2.345678},
        headers={"If-None-Match": etag},
    )
    assert cached.status_code == 304
    assert cached.headers["ETag"].strip('"') == etag
    assert len(calls) == 1


def test_wind_provider_components_and_cache(monkeypatch):
    wind_calls: list[str] = []

    def wind_handler(request: httpx.Request) -> httpx.Response:
        wind_calls.append(str(request.url))
        payload = {
            "hourly": {
                "time": ["2023-01-01T00:00"],
                "wind_speed_10m": [8.0],
                "wind_direction_10m": [180.0],
            }
        }
        return httpx.Response(200, json=payload)

    elevation_transport = httpx.MockTransport(lambda request: httpx.Response(500))
    wind_transport = httpx.MockTransport(wind_handler)

    fixed_now = datetime(2023, 1, 1, 0, tzinfo=timezone.utc)

    client = _build_client(
        monkeypatch,
        elevation_transport=elevation_transport,
        wind_transport=wind_transport,
        now_fn=lambda: fixed_now,
    )

    response = client.get(
        "/providers/wind",
        params={"lat": 4.0, "lon": 5.0, "bearing": 0.0},
    )
    assert response.status_code == 200
    payload = response.json()
    assert pytest.approx(payload["speed_mps"], rel=1e-6) == 8.0
    assert pytest.approx(payload["dir_from_deg"], rel=1e-6) == 180.0
    assert pytest.approx(payload["w_parallel"], rel=1e-6) == 8.0
    assert pytest.approx(payload["w_perp"], abs=1e-6) == 0.0
    assert payload["ttl_s"] > 0
    etag = payload["etag"]
    assert etag
    assert len(wind_calls) == 1

    second = client.get(
        "/providers/wind",
        params={"lat": 4.0, "lon": 5.0, "bearing": 0.0},
    )
    assert second.status_code == 200
    assert second.json()["etag"] == etag
    assert len(wind_calls) == 1

    cached = client.get(
        "/providers/wind",
        params={"lat": 4.0, "lon": 5.0, "bearing": 0.0},
        headers={"If-None-Match": etag},
    )
    assert cached.status_code == 304
    assert cached.headers["ETag"].strip('"') == etag
    assert len(wind_calls) == 1
