import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from server.routes import course_bundle


def _make_request(headers: dict[str, str] | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
    }
    if headers:
        scope["headers"] = [
            (key.lower().encode("latin-1"), value.encode("latin-1"))
            for key, value in headers.items()
        ]

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, receive)


def test_if_none_match_handles_empty_tokens():
    header = ' ,W/"abc", "def"'
    assert course_bundle._if_none_match_matches(header, '"def"') is True
    assert course_bundle._if_none_match_matches(header, '"nope"') is False


def test_normalize_etag_strips_quotes_and_none():
    assert course_bundle._normalize_etag('"abc"') == "abc"
    assert course_bundle._normalize_etag(None) is None


def test_apply_cache_headers_sets_values():
    response = course_bundle._apply_cache_headers(
        SimpleNamespace(headers={}), '"etag"', 120
    )
    assert response.headers["ETag"] == '"etag"'
    assert response.headers["Cache-Control"] == "public, max-age=120"


def test_apply_cache_headers_without_etag():
    response = course_bundle._apply_cache_headers(SimpleNamespace(headers={}), None, 30)
    assert "ETag" not in response.headers
    assert response.headers["Cache-Control"] == "public, max-age=30"


def test_get_course_hole_not_found(monkeypatch):
    class Bundle:
        etag = '"abc"'
        ttl_seconds = None
        holes = []

    monkeypatch.setattr(course_bundle, "load_bundle", lambda *_: Bundle)

    request = _make_request()
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(course_bundle.get_course_hole("course-1", 5, request))
    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "hole not found"


def test_get_course_hole_returns_not_modified(monkeypatch):
    class Hole:
        number = 3

        def to_feature_collection(self):
            return {"hole": 3}

    class Bundle:
        etag = '"xyz"'
        ttl_seconds = 60
        holes = [Hole()]

    bundle = Bundle()

    monkeypatch.setattr(course_bundle, "load_bundle", lambda *_: bundle)

    request = _make_request({"if-none-match": 'W/"xyz"'})
    response = asyncio.run(course_bundle.get_course_hole("course-1", 3, request))
    assert response.status_code == 304
    assert response.headers["ETag"] == '"xyz"'
    assert response.headers["Cache-Control"] == "public, max-age=60"
