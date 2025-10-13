from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from server.courses.service import (
    CourseBundleNotFoundError,
    DEFAULT_TTL_SECONDS,
    list_courses,
    list_holes,
    load_bundle,
)

router = APIRouter(tags=["course-bundle"])


def _normalize_etag(etag: Optional[str]) -> Optional[str]:
    if not etag:
        return None
    return etag.strip('"')


def _if_none_match_matches(header_value: Optional[str], etag: Optional[str]) -> bool:
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


def _apply_cache_headers(response: Response, etag: Optional[str], ttl: int) -> Response:
    if etag:
        response.headers["ETag"] = f'"{_normalize_etag(etag)}"'
    response.headers["Cache-Control"] = f"public, max-age={ttl}"
    return response


@router.get("/courses")
async def get_courses() -> JSONResponse:
    courses = list_courses()
    return JSONResponse({"courses": courses})


@router.get("/course/{course_id}")
async def get_course_bundle(course_id: str, request: Request) -> Response:
    try:
        bundle = load_bundle(course_id)
    except CourseBundleNotFoundError as exc:  # pragma: no cover - thin wrapper
        raise HTTPException(status_code=404, detail="course bundle not found") from exc

    etag = bundle.etag
    ttl = bundle.ttl_seconds or DEFAULT_TTL_SECONDS

    if _if_none_match_matches(request.headers.get("if-none-match"), etag):
        response = Response(status_code=304)
        return _apply_cache_headers(response, etag, ttl)

    payload = bundle.to_feature_collection()
    response = JSONResponse(payload)
    return _apply_cache_headers(response, etag, ttl)


@router.get("/course/{course_id}/holes")
async def get_course_holes(course_id: str) -> JSONResponse:
    try:
        bundle = load_bundle(course_id)
    except CourseBundleNotFoundError as exc:  # pragma: no cover - thin wrapper
        raise HTTPException(status_code=404, detail="course bundle not found") from exc

    holes = list_holes(course_id, bundle=bundle)
    payload = {
        "course": {
            "id": bundle.id,
            "name": bundle.name,
            "updatedAt": bundle.updated_at,
            "etag": bundle.etag,
        },
        "holes": holes,
    }
    return JSONResponse(payload)


@router.get("/course/{course_id}/holes/{hole_number}")
async def get_course_hole(
    course_id: str, hole_number: int, request: Request
) -> Response:
    try:
        bundle = load_bundle(course_id)
    except CourseBundleNotFoundError as exc:  # pragma: no cover - thin wrapper
        raise HTTPException(status_code=404, detail="course bundle not found") from exc

    hole = next((hole for hole in bundle.holes if hole.number == hole_number), None)
    if not hole:
        raise HTTPException(status_code=404, detail="hole not found")

    etag = bundle.etag
    ttl = bundle.ttl_seconds or DEFAULT_TTL_SECONDS

    if _if_none_match_matches(request.headers.get("if-none-match"), etag):
        response = Response(status_code=304)
        return _apply_cache_headers(response, etag, ttl)

    payload = hole.to_feature_collection()
    response = JSONResponse(payload)
    return _apply_cache_headers(response, etag, ttl)
