from __future__ import annotations

import os
from functools import lru_cache
from typing import Mapping
from urllib.parse import urljoin, urlparse, urlunparse

from .cdn import to_cdn


def _sanitize_base(value: str | None) -> str | None:
    if not value:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    return trimmed.rstrip("/")


@lru_cache(maxsize=1)
def get_media_cdn_base() -> str | None:
    return _sanitize_base(os.getenv("MEDIA_CDN_BASE_URL"))


@lru_cache(maxsize=1)
def get_media_origin_base() -> str | None:
    base = os.getenv("MEDIA_ORIGIN_BASE_URL") or os.getenv("HLS_BASE_URL")
    return _sanitize_base(base)


def reset_media_url_cache() -> None:
    get_media_cdn_base.cache_clear()
    get_media_origin_base.cache_clear()


def _host(netloc: str) -> str:
    if netloc.endswith(":80"):
        return netloc[:-3]
    if netloc.endswith(":443"):
        return netloc[:-4]
    return netloc


def _normalize_media_url(url: str | None, origin_base: str | None) -> str | None:
    if not url:
        return None
    candidate = str(url).strip()
    if not candidate:
        return None

    parsed = urlparse(candidate)
    if parsed.scheme and parsed.netloc:
        path = parsed.path or ""
        if path and not path.startswith("/"):
            path = f"/{path}"
        return urlunparse((parsed.scheme, parsed.netloc, path, "", parsed.query, ""))

    normalized_path = parsed.path or ""
    if normalized_path and not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"

    query = parsed.query

    if origin_base:
        joined = urljoin(f"{origin_base}/", normalized_path.lstrip("/"))
        if query:
            return f"{joined}?{query}"
        return joined

    if normalized_path:
        if query:
            return f"{normalized_path}?{query}"
        return normalized_path

    return candidate


def rewrite_media_url(url: str | None) -> str | None:
    if not url:
        return None

    candidate = str(url).strip()
    if not candidate:
        return None

    parsed_original = urlparse(candidate)
    if parsed_original.scheme and parsed_original.scheme not in ("http", "https"):
        return candidate

    origin_base = get_media_origin_base()
    normalized = _normalize_media_url(candidate, origin_base)
    if not normalized:
        return None

    cdn_base = get_media_cdn_base()
    if not cdn_base:
        return normalized

    parsed = urlparse(normalized)
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return normalized

    if not parsed.netloc:
        return to_cdn(normalized, cdn_base)

    origin_host = _host(urlparse(origin_base).netloc) if origin_base else ""
    allow_csv = os.getenv("MEDIA_CDN_REWRITE_HOSTS", "")
    allow_hosts = {_host(host.strip()) for host in allow_csv.split(",") if host.strip()}
    allowed_hosts = set(allow_hosts)
    if origin_host:
        allowed_hosts.add(origin_host)

    if _host(parsed.netloc) in allowed_hosts:
        return to_cdn(normalized, cdn_base)

    return normalized


def resolve_thumb_url(record: Mapping[str, object]) -> str | None:
    for key in ("thumbUrl", "thumb_url", "thumbnailUrl", "thumbnail_url"):
        value = record.get(key)
        rewritten = rewrite_media_url(str(value)) if value else None
        if rewritten:
            return rewritten

    video_value = record.get("videoUrl") or record.get("video_url")
    hls_value = record.get("hlsPath") or record.get("hls_path")
    source = video_value or hls_value
    normalized_source = _normalize_media_url(
        str(source) if source else None, get_media_origin_base()
    )
    if not normalized_source:
        return None

    parsed = urlparse(normalized_source)
    path = parsed.path or ""
    if not path:
        return None
    if path.endswith("/"):
        thumb_path = f"{path.rstrip('/')}/thumb.jpg"
    else:
        head, _, _ = path.rpartition("/")
        thumb_path = f"{head}/thumb.jpg" if head else "/thumb.jpg"

    if parsed.scheme and parsed.netloc:
        candidate = urlunparse((parsed.scheme, parsed.netloc, thumb_path, "", "", ""))
    else:
        origin_base = get_media_origin_base()
        candidate = (
            urljoin(f"{origin_base}/", thumb_path.lstrip("/"))
            if origin_base
            else thumb_path
        )
    return rewrite_media_url(candidate)


__all__ = [
    "get_media_cdn_base",
    "get_media_origin_base",
    "rewrite_media_url",
    "resolve_thumb_url",
    "reset_media_url_cache",
]
