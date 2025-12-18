from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from server.providers import elevation, wind
from server.providers.elevation import ElevationProviderResult
from server.providers.errors import ProviderError
from server.providers.wind import WindProviderResult

router = APIRouter(prefix="/providers", tags=["providers"])


def _normalize_etag(etag: str | None) -> str | None:
    if not etag:
        return None
    return etag.strip('"')


def _if_none_match_matches(header_value: str | None, etag: str | None) -> bool:
    if not header_value or not etag:
        return False
    normalized_etag = _normalize_etag(etag)
    for token in header_value.split(","):
        candidate = token.strip()
        if not candidate:
            continue
        if candidate == "*":
            return True
        if candidate.startswith("W/"):
            candidate = candidate[2:].strip()
        candidate = candidate.strip('"')
        if candidate == normalized_etag:
            return True
    return False


def _apply_cache_headers(response: Response, etag: str | None, ttl: int) -> Response:
    if etag:
        response.headers["ETag"] = f'"{_normalize_etag(etag)}"'
    response.headers["Cache-Control"] = f"public, max-age={max(ttl, 0)}"
    return response


def _result_payload(
    result: ElevationProviderResult | WindProviderResult,
) -> dict[str, float | str | int | None]:
    ttl = result.ttl_seconds
    payload: dict[str, float | str | int | None]
    if isinstance(result, ElevationProviderResult):
        payload = {
            "elevation_m": result.elevation_m,
        }
    elif isinstance(result, WindProviderResult):
        payload = {
            "speed_mps": result.speed_mps,
            "dir_from_deg": result.direction_from_deg,
        }
    else:  # pragma: no cover - defensive
        payload = {}
    payload["etag"] = result.etag
    payload["ttl_s"] = ttl
    return payload


@router.get("/elevation")
async def elevation_endpoint(
    request: Request, lat: float = Query(...), lon: float = Query(...)
) -> Response:
    try:
        result = await run_in_threadpool(lambda: elevation.get_elevation(lat, lon))
    except ProviderError as exc:  # pragma: no cover - handled in tests
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if _if_none_match_matches(request.headers.get("if-none-match"), result.etag):
        refreshed = await run_in_threadpool(
            lambda: elevation.refresh_elevation(lat, lon)
        )
        result = refreshed or result
        response = Response(status_code=304)
        return _apply_cache_headers(response, result.etag, result.ttl_seconds)

    payload = _result_payload(result)
    response = JSONResponse(payload)
    return _apply_cache_headers(response, result.etag, result.ttl_seconds)


@router.get("/wind")
async def wind_endpoint(
    request: Request,
    lat: float = Query(...),
    lon: float = Query(...),
    bearing: float | None = Query(None),
) -> Response:
    try:
        result = await run_in_threadpool(lambda: wind.get_wind(lat, lon))
    except ProviderError as exc:  # pragma: no cover - handled in tests
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if _if_none_match_matches(request.headers.get("if-none-match"), result.etag):
        refreshed = await run_in_threadpool(lambda: wind.refresh_wind(lat, lon))
        result = refreshed or result
        response = Response(status_code=304)
        return _apply_cache_headers(response, result.etag, result.ttl_seconds)

    payload = _result_payload(result)
    w_parallel = None
    w_perp = None
    if bearing is not None:
        w_parallel, w_perp = wind.compute_components(result, bearing)
    payload["w_parallel"] = w_parallel
    payload["w_perp"] = w_perp

    response = JSONResponse(payload)
    return _apply_cache_headers(response, result.etag, result.ttl_seconds)
