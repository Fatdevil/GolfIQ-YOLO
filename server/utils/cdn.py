from __future__ import annotations

from urllib.parse import urlparse, urlunparse


def to_cdn(url: str, cdn_base: str | None) -> str:
    """Rewrite ``url`` so it is served through ``cdn_base``.

    The original path and query string are preserved while scheme and network
    location are swapped with the CDN base components. When ``cdn_base`` is
    falsey the input ``url`` is returned unchanged.
    """

    if not cdn_base:
        return url

    src = urlparse(url)
    cdn = urlparse(cdn_base)
    path = src.path or ""
    if not path.startswith("/"):
        path = f"/{path}" if path else ""
    return urlunparse((cdn.scheme, cdn.netloc, path, "", src.query, ""))


__all__ = ["to_cdn"]
