from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Dict

import httpx

from .cache import CacheEntry, ProviderCache
from .errors import ProviderError

ELEVATION_CACHE_TTL = 60 * 60 * 24 * 7  # 7 days
_OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
_OPENTOPO_URL = "https://api.opentopodata.org/v1/aster30m"

_cache = ProviderCache("elevation", ELEVATION_CACHE_TTL)

@dataclass
class ElevationProviderResult:
    elevation_m: float
    etag: str
    expires_at: float

    @property
    def ttl_seconds(self) -> int:
        remaining = int(self.expires_at - time.time())
        return max(0, remaining)


def _http_client_factory(**kwargs: Any) -> httpx.Client:
    timeout = kwargs.pop("timeout", 10.0)
    return httpx.Client(timeout=timeout, **kwargs)


def _cache_entry_to_result(entry: CacheEntry) -> ElevationProviderResult:
    elevation_m = float(entry.value["elevation_m"])
    return ElevationProviderResult(
        elevation_m=elevation_m,
        etag=entry.etag,
        expires_at=entry.expires_at,
    )


def get_elevation(lat: float, lon: float) -> ElevationProviderResult:
    key = f"{lat:.5f},{lon:.5f}"
    entry = _cache.get(key)
    if entry:
        return _cache_entry_to_result(entry)

    data = _fetch_elevation(lat, lon)
    entry = _cache.set(key, data)
    return _cache_entry_to_result(entry)


def refresh_elevation(lat: float, lon: float) -> ElevationProviderResult | None:
    key = f"{lat:.5f},{lon:.5f}"
    entry = _cache.touch(key)
    if not entry:
        return None
    return _cache_entry_to_result(entry)


def _fetch_elevation(lat: float, lon: float) -> Dict[str, float]:
    try:
        value = _fetch_open_meteo(lat, lon)
    except ProviderError:
        value = _fetch_opentopo(lat, lon)
    return {"elevation_m": value}


def _fetch_open_meteo(lat: float, lon: float) -> float:
    params = {"latitude": lat, "longitude": lon}
    try:
        with _http_client_factory(timeout=10.0) as client:
            response = client.get(_OPEN_METEO_ELEVATION_URL, params=params)
    except httpx.RequestError as exc:
        raise ProviderError(f"open-meteo elevation request failed: {exc}") from exc
    if response.status_code != 200:
        raise ProviderError(f"open-meteo elevation failed: {response.status_code}")
    payload = response.json()
    elevations = payload.get("elevation")
    if not elevations:
        raise ProviderError("open-meteo elevation missing data")
    value = elevations[0]
    if value is None:
        raise ProviderError("open-meteo elevation null value")
    return float(value)


def _fetch_opentopo(lat: float, lon: float) -> float:
    params = {"locations": f"{lat},{lon}"}
    try:
        with _http_client_factory(timeout=10.0) as client:
            response = client.get(_OPENTOPO_URL, params=params)
    except httpx.RequestError as exc:
        raise ProviderError(f"opentopodata request failed: {exc}") from exc
    if response.status_code != 200:
        raise ProviderError(f"opentopodata failed: {response.status_code}")
    payload = response.json()
    results = payload.get("results") or []
    if not results:
        raise ProviderError("opentopodata missing results")
    value = results[0].get("elevation")
    if value is None:
        raise ProviderError("opentopodata elevation null value")
    return float(value)
