from __future__ import annotations

import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx

from .cache import CacheEntry, ProviderCache
from .errors import ProviderError

WIND_CACHE_TTL = 60 * 15  # 15 minutes
_OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

_cache = ProviderCache("wind", WIND_CACHE_TTL)


@dataclass
class WindProviderResult:
    speed_mps: float
    direction_from_deg: float
    etag: str
    expires_at: float

    @property
    def ttl_seconds(self) -> int:
        remaining = int(self.expires_at - time.time())
        return max(0, remaining)


def _http_client_factory(**kwargs: Any) -> httpx.Client:
    timeout = kwargs.pop("timeout", 10.0)
    return httpx.Client(timeout=timeout, **kwargs)


def _cache_entry_to_result(entry: CacheEntry) -> WindProviderResult:
    data = entry.value
    return WindProviderResult(
        speed_mps=float(data["speed_mps"]),
        direction_from_deg=float(data["dir_from_deg"]),
        etag=entry.etag,
        expires_at=entry.expires_at,
    )


def get_wind(
    lat: float, lon: float, when: Optional[datetime] = None
) -> WindProviderResult:
    key = _cache_key(lat, lon, when)
    entry = _cache.get(key)
    if entry:
        return _cache_entry_to_result(entry)

    payload = _fetch_wind(lat, lon, when)
    entry = _cache.set(key, payload, ttl=WIND_CACHE_TTL)
    return _cache_entry_to_result(entry)


def refresh_wind(
    lat: float, lon: float, when: Optional[datetime] = None
) -> WindProviderResult | None:
    key = _cache_key(lat, lon, when)
    entry = _cache.touch(key, ttl=WIND_CACHE_TTL)
    if not entry:
        return None
    return _cache_entry_to_result(entry)


def compute_components(
    result: WindProviderResult, bearing_deg: float
) -> Tuple[float, float]:
    bearing_rad = math.radians(bearing_deg % 360)
    shot_vector = (math.sin(bearing_rad), math.cos(bearing_rad))

    wind_from_rad = math.radians(result.direction_from_deg % 360)
    wind_to_rad = (wind_from_rad + math.pi) % (2 * math.pi)
    wind_vector = (math.sin(wind_to_rad), math.cos(wind_to_rad))

    w_parallel = result.speed_mps * (
        wind_vector[0] * shot_vector[0] + wind_vector[1] * shot_vector[1]
    )
    perp_vector = (shot_vector[1], -shot_vector[0])
    w_perp = result.speed_mps * (
        wind_vector[0] * perp_vector[0] + wind_vector[1] * perp_vector[1]
    )
    return (w_parallel, w_perp)


def _cache_key(lat: float, lon: float, when: Optional[datetime]) -> str:
    base = f"{lat:.5f},{lon:.5f}"
    if when is None:
        return base
    normalized = _normalize_when(when)
    return f"{base}@{normalized}"


def _normalize_when(when: datetime) -> str:
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when = when.astimezone(timezone.utc)
    truncated = when.replace(minute=0, second=0, microsecond=0)
    return truncated.strftime("%Y-%m-%dT%H:%M")


def _fetch_wind(lat: float, lon: float, when: Optional[datetime]) -> Dict[str, float]:
    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "windspeed_unit": "ms",
        "timezone": "UTC",
        "past_days": 1,
        "forecast_days": 1,
    }
    try:
        with _http_client_factory(timeout=10.0) as client:
            response = client.get(_OPEN_METEO_FORECAST_URL, params=params)
    except httpx.RequestError as exc:
        raise ProviderError(f"open-meteo forecast request failed: {exc}") from exc
    if response.status_code != 200:
        raise ProviderError(f"open-meteo forecast failed: {response.status_code}")
    payload = response.json()
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    speeds = hourly.get("wind_speed_10m") or []
    directions = hourly.get("wind_direction_10m") or []
    if not (times and len(times) == len(speeds) == len(directions)):
        raise ProviderError("open-meteo hourly wind missing data")

    index = _select_hour_index(times, when)
    try:
        speed = float(speeds[index])
        direction = float(directions[index])
    except (IndexError, ValueError, TypeError) as exc:
        raise ProviderError("open-meteo hourly wind invalid entry") from exc

    return {"speed_mps": speed, "dir_from_deg": direction}


def _select_hour_index(times: Any, when: Optional[datetime]) -> int:
    if when is None:
        target = _now()
    else:
        target = when
    target = _ensure_aware(target)
    target = target.astimezone(timezone.utc)
    target_hour = target.replace(minute=0, second=0, microsecond=0)

    best_index = 0
    best_delta = None
    for idx, time_str in enumerate(times):
        try:
            current = datetime.fromisoformat(str(time_str))
        except ValueError:
            continue
        current = _ensure_aware(current).astimezone(timezone.utc)
        delta = abs((current - target_hour).total_seconds())
        if best_delta is None or delta < best_delta:
            best_index = idx
            best_delta = delta
    return best_index


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _now() -> datetime:
    return datetime.now(timezone.utc)
