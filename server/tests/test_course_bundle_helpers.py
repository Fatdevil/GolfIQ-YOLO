from __future__ import annotations

from fastapi import Response

from server.routes import course_bundle


def test_normalize_etag_strips_quotes() -> None:
    assert course_bundle._normalize_etag('"abc"') == "abc"
    assert course_bundle._normalize_etag(None) is None


def test_if_none_match_matches_handles_candidates() -> None:
    weak_header = 'W/"abc", "def"'
    assert course_bundle._if_none_match_matches(weak_header, '"abc"') is True
    assert course_bundle._if_none_match_matches("*", '"anything"') is True
    assert course_bundle._if_none_match_matches(None, '"abc"') is False


def test_apply_cache_headers_normalizes_etag() -> None:
    response = course_bundle._apply_cache_headers(Response(), 'W/"abc"', ttl=60)
    assert response.headers["ETag"] == '"W/"abc"'
    assert response.headers["Cache-Control"] == "public, max-age=60"
