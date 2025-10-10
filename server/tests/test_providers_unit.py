from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable

import httpx
import pytest
from fastapi import Response

from server.providers import cache, elevation, wind
from server.providers.elevation import ElevationProviderResult, ELEVATION_CACHE_TTL
from server.providers.errors import ProviderError
from server.providers.wind import WindProviderResult, WIND_CACHE_TTL
from server.routes import providers as provider_routes


class _FakeClock:
    def __init__(self, start: float) -> None:
        self._value = start

    def time(self) -> float:
        return self._value

    def advance(self, delta: float) -> None:
        self._value += delta


def _make_client_factory(
    handlers: Iterable[Callable[[httpx.Request], httpx.Response]],
) -> Callable[..., httpx.Client]:
    handler_iter = iter(handlers)

    def factory(**kwargs) -> httpx.Client:
        try:
            handler = next(handler_iter)
        except StopIteration as exc:  # pragma: no cover - defensive
            raise AssertionError("unexpected extra HTTP call") from exc
        transport = httpx.MockTransport(handler)
        timeout = kwargs.get("timeout", 10.0)
        return httpx.Client(transport=transport, timeout=timeout)

    return factory


@pytest.fixture(autouse=True)
def _reset_provider_state(tmp_path, monkeypatch):
    monkeypatch.setenv("GOLFIQ_PROVIDER_CACHE_DIR", str(tmp_path))
    elevation._cache = cache.ProviderCache("test-elevation", ELEVATION_CACHE_TTL)
    wind._cache = cache.ProviderCache("test-wind", WIND_CACHE_TTL)
    yield


@pytest.fixture
def fake_clock(monkeypatch) -> _FakeClock:
    clock = _FakeClock(start=1_000_000.0)
    monkeypatch.setattr(cache.time, "time", clock.time)
    monkeypatch.setattr(elevation.time, "time", clock.time)
    monkeypatch.setattr(wind.time, "time", clock.time)
    return clock


def test_provider_cache_persistence_and_touch(tmp_path, fake_clock):
    store = cache.ProviderCache("unit-cache", default_ttl=10)
    entry = store.set("alpha", {"value": 1})
    assert entry.etag  # generated via _hash_value
    assert entry.ttl_seconds == 10

    fake_clock.advance(4)
    cached = store.get("alpha")
    assert cached is not None
    assert cached.ttl_seconds == 6

    fake_clock.advance(10)
    assert store.get("alpha") is None  # expired and flushed
    disk_payload = json.loads((tmp_path / "unit-cache.json").read_text())
    assert disk_payload == {"entries": {}}

    store.set("alpha", {"value": 2}, ttl=5, etag="manual")
    fake_clock.advance(2)
    touched = store.touch("alpha", ttl=9)
    assert touched is not None
    assert touched.etag == "manual"
    assert touched.ttl_seconds == 9

    restored = cache.ProviderCache("unit-cache", default_ttl=3)
    loaded = restored.get("alpha")
    assert loaded is not None
    assert loaded.etag == "manual"

    fake_clock.advance(20)
    assert restored.touch("alpha") is None


def test_provider_cache_loads_only_valid_entries(tmp_path, fake_clock):
    cache_path = tmp_path / "corrupt.json"
    cache_path.write_text("{not-json")
    store = cache.ProviderCache("corrupt", default_ttl=5)
    assert store.get("missing") is None

    valid_payload = {
        "entries": {
            "expired": {
                "value": {"value": 1},
                "etag": "expired",
                "expires_at": fake_clock.time() - 10,
            },
            "no_etag": {
                "value": {"value": 2},
                "expires_at": fake_clock.time() + 10,
            },
            "good": {
                "value": {"value": 3},
                "etag": "keep",
                "expires_at": fake_clock.time() + 10,
            },
        }
    }
    cache_path.write_text(json.dumps(valid_payload))
    store = cache.ProviderCache("corrupt", default_ttl=5)
    assert store.get("expired") is None
    assert store.get("no_etag") is None
    good = store.get("good")
    assert good is not None
    assert good.value == {"value": 3}


def test_get_elevation_fallback_and_refresh(monkeypatch, fake_clock):
    handlers = [
        lambda request: httpx.Response(500, json={}),
        lambda request: httpx.Response(200, json={"results": [{"elevation": 123.4}]}),
    ]
    monkeypatch.setattr(
        elevation, "_http_client_factory", _make_client_factory(handlers)
    )

    result = elevation.get_elevation(1.0, 2.0)
    assert pytest.approx(result.elevation_m) == 123.4
    assert result.ttl_seconds > 0

    cached = elevation.get_elevation(1.0, 2.0)
    assert cached.elevation_m == pytest.approx(result.elevation_m)

    fake_clock.advance(1)
    refreshed = elevation.refresh_elevation(1.0, 2.0)
    assert refreshed is not None
    assert refreshed.elevation_m == pytest.approx(result.elevation_m)


def test_refresh_elevation_without_entry_returns_none():
    assert elevation.refresh_elevation(9.0, 9.0) is None


def test_fetch_open_meteo_request_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    monkeypatch.setattr(
        elevation, "_http_client_factory", _make_client_factory([handler])
    )
    with pytest.raises(ProviderError, match="request failed"):
        elevation._fetch_open_meteo(1.0, 2.0)


@pytest.mark.parametrize(
    "payload, status, message",
    [
        ({"elevation": []}, 200, "missing data"),
        ({"elevation": [None]}, 200, "null value"),
        ({"detail": "err"}, 500, "failed: 500"),
    ],
)
def test_fetch_open_meteo_error_responses(monkeypatch, payload, status, message):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(
        elevation, "_http_client_factory", _make_client_factory([handler])
    )
    with pytest.raises(ProviderError, match=message):
        elevation._fetch_open_meteo(1.0, 2.0)


def test_fetch_opentopo_request_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("oops", request=request)

    monkeypatch.setattr(
        elevation, "_http_client_factory", _make_client_factory([handler])
    )
    with pytest.raises(ProviderError, match="request failed"):
        elevation._fetch_opentopo(1.0, 2.0)


@pytest.mark.parametrize(
    "payload, status, message",
    [
        ({"results": []}, 200, "missing results"),
        ({"results": [{"elevation": None}]}, 200, "null value"),
        ({"error": "bad"}, 404, "failed: 404"),
    ],
)
def test_fetch_opentopo_error_responses(monkeypatch, payload, status, message):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(
        elevation, "_http_client_factory", _make_client_factory([handler])
    )
    with pytest.raises(ProviderError, match=message):
        elevation._fetch_opentopo(1.0, 2.0)


def test_get_wind_caches_and_computes(monkeypatch, fake_clock):
    payload = {
        "hourly": {
            "time": ["2023-01-01T00:00", "2023-01-01T01:00"],
            "wind_speed_10m": [8.0, 12.0],
            "wind_direction_10m": [180.0, 200.0],
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    monkeypatch.setattr(wind, "_http_client_factory", _make_client_factory([handler]))
    monkeypatch.setattr(
        wind, "_now", lambda: datetime(2023, 1, 1, 0, tzinfo=timezone.utc)
    )

    result = wind.get_wind(4.0, 5.0)
    assert pytest.approx(result.speed_mps) == 8.0
    assert pytest.approx(result.direction_from_deg) == 180.0

    cached = wind.get_wind(4.0, 5.0)
    assert cached.speed_mps == pytest.approx(8.0)

    fake_clock.advance(5)
    refreshed = wind.refresh_wind(4.0, 5.0)
    assert refreshed is not None

    w_parallel, w_perp = wind.compute_components(result, bearing_deg=0.0)
    assert pytest.approx(w_parallel, abs=1e-6) == 8.0
    assert pytest.approx(w_perp, abs=1e-6) == 0.0


def test_refresh_wind_without_entry_returns_none():
    assert wind.refresh_wind(1.0, 1.0) is None


def test_fetch_wind_request_error(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    monkeypatch.setattr(wind, "_http_client_factory", _make_client_factory([handler]))
    with pytest.raises(ProviderError, match="request failed"):
        wind._fetch_wind(1.0, 2.0, None)


@pytest.mark.parametrize(
    "payload, status, message",
    [
        ({"hourly": {}}, 200, "missing data"),
        (
            {
                "hourly": {
                    "time": ["2023"],
                    "wind_speed_10m": ["bad"],
                    "wind_direction_10m": [0],
                }
            },
            200,
            "invalid entry",
        ),
        ({"error": "bad"}, 503, "failed: 503"),
    ],
)
def test_fetch_wind_error_responses(monkeypatch, payload, status, message):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=payload)

    monkeypatch.setattr(wind, "_http_client_factory", _make_client_factory([handler]))
    target_time = datetime(2023, 1, 1, tzinfo=timezone.utc)
    with pytest.raises(ProviderError, match=message):
        wind._fetch_wind(1.0, 2.0, target_time)


def test_select_hour_index_skips_invalid_entries(monkeypatch):
    monkeypatch.setattr(
        wind, "_now", lambda: datetime(2023, 1, 1, 2, tzinfo=timezone.utc)
    )
    times = ["bad", "2023-01-01T01:00", "2023-01-01T02:00"]
    index = wind._select_hour_index(times, when=None)
    assert index == 2


def test_cache_key_and_normalize_when():
    naive = datetime(2023, 1, 1, 5, 30)
    aware = datetime(2023, 1, 1, 5, 30, tzinfo=timezone(timedelta(hours=2)))
    assert wind._cache_key(1.0, 2.0, None) == "1.00000,2.00000"
    assert wind._cache_key(1.0, 2.0, naive) == "1.00000,2.00000@2023-01-01T05:00"
    assert wind._normalize_when(aware) == "2023-01-01T03:00"


def test_route_helper_if_none_match_variants(fake_clock):
    assert provider_routes._normalize_etag(None) is None
    assert provider_routes._if_none_match_matches(None, "abc") is False
    assert provider_routes._if_none_match_matches('W/"abc"', "abc") is True
    assert provider_routes._if_none_match_matches('*, "zzz"', "abc") is True
    assert provider_routes._if_none_match_matches(" , ", "abc") is False

    result = ElevationProviderResult(
        elevation_m=10.0,
        h_asl_m=10.0,
        etag="tag",
        expires_at=fake_clock.time() + 30,
    )
    payload = provider_routes._result_payload(result)
    assert payload["elevation_m"] == 10.0
    assert payload["h_asl_m"] == 10.0

    wind_result = WindProviderResult(
        speed_mps=5.0,
        direction_from_deg=90.0,
        temperature_c=12.0,
        etag="w",
        expires_at=fake_clock.time() + 30,
    )
    payload = provider_routes._result_payload(wind_result)
    assert payload["speed_mps"] == 5.0
    assert payload["dir_from_deg"] == 90.0
    assert payload["temperature_c"] == 12.0

    response = provider_routes._apply_cache_headers(Response(), "tag", 42)
    assert response.headers["ETag"] == '"tag"'
    assert response.headers["Cache-Control"] == "public, max-age=42"


def test_provider_http_client_factories():
    client = elevation._http_client_factory()
    try:
        assert isinstance(client, httpx.Client)
    finally:
        client.close()

    wind_client = wind._http_client_factory()
    try:
        assert isinstance(wind_client, httpx.Client)
    finally:
        wind_client.close()


def test_wind_now_timezone_awareness():
    value = wind._now()
    assert value.tzinfo is not None
