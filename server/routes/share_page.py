from __future__ import annotations

import json
import re
from html import escape
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from ..services.share_summary import build_shareable_summary, describe_summary, guess_kind
from ..storage.runs import load_run
from .runs_upload import _format_run_record, _load_shared_payload

router = APIRouter(include_in_schema=False)

_INDEX_TEMPLATE: Optional[str] = None
_FALLBACK_TEMPLATE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GolfIQ Analyzer</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
"""


@router.get("/share/{run_id}", response_class=HTMLResponse)
async def render_share_page(run_id: str, request: Request) -> HTMLResponse:
    payload = _load_payload(run_id)
    status_code = 200
    if payload is None:
        description = "Shared GolfIQ run"
        summary = None
        status_code = 404
    else:
        kind = guess_kind(run_id, payload)
        summary = build_shareable_summary(kind, payload)
        description = describe_summary(summary)

    title = f"GolfIQ – Run {run_id}"
    canonical = str(request.url)
    html = _render_index_html(title=title, description=description, url=canonical)
    return HTMLResponse(content=html, status_code=status_code, media_type="text/html")


def _load_payload(run_id: str) -> Optional[Any]:
    shared = _load_shared_payload(run_id)
    if shared:
        content, _etag = shared
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    record = load_run(run_id)
    if not record:
        return None
    return _format_run_record(record)


def _render_index_html(*, title: str, description: str, url: str) -> str:
    template = _index_template()
    safe_title = escape(title, quote=True)
    safe_desc = escape(_truncate(description.strip()))
    safe_url = escape(url, quote=True)

    html = _replace_title(template, safe_title)
    html = _upsert_meta(
        html,
        r"<meta[^>]+name=['"]description['"][^>]*>",
        f"<meta name="description" content="{safe_desc}" />",
    )
    html = _upsert_meta(
        html,
        r"<meta[^>]+property=['"]og:title['"][^>]*>",
        f"<meta property="og:title" content="{safe_title}" />",
    )
    html = _upsert_meta(
        html,
        r"<meta[^>]+property=['"]og:description['"][^>]*>",
        f"<meta property="og:description" content="{safe_desc}" />",
    )
    html = _upsert_meta(
        html,
        r"<meta[^>]+property=['"]og:url['"][^>]*>",
        f"<meta property="og:url" content="{safe_url}" />",
    )
    html = _upsert_meta(
        html,
        r"<meta[^>]+property=['"]og:type['"][^>]*>",
        "<meta property="og:type" content="website" />",
    )
    html = _upsert_link(
        html,
        r"<link[^>]+rel=['"]canonical['"][^>]*>",
        f"<link rel="canonical" href="{safe_url}" />",
    )
    return html


def _index_template() -> str:
    global _INDEX_TEMPLATE
    if _INDEX_TEMPLATE is None:
        root = Path(__file__).resolve().parents[2]
        candidates = [root / "web" / "dist" / "index.html", root / "web" / "index.html"]
        for path in candidates:
            if path.exists():
                _INDEX_TEMPLATE = path.read_text(encoding="utf-8")
                break
        if _INDEX_TEMPLATE is None:
            _INDEX_TEMPLATE = _FALLBACK_TEMPLATE
    return _INDEX_TEMPLATE


def _replace_title(html: str, title: str) -> str:
    pattern = re.compile(r"<title>.*?</title>", re.IGNORECASE | re.DOTALL)
    replacement = f"<title>{title}</title>"
    if pattern.search(html):
        return pattern.sub(replacement, html, count=1)
    return html.replace("</head>", f"  {replacement}\n</head>")


def _upsert_meta(html: str, pattern: str, replacement: str) -> str:
    regex = re.compile(pattern, re.IGNORECASE)
    if regex.search(html):
        return regex.sub(replacement, html, count=1)
    return html.replace("</head>", f"    {replacement}\n  </head>")


def _upsert_link(html: str, pattern: str, replacement: str) -> str:
    regex = re.compile(pattern, re.IGNORECASE)
    if regex.search(html):
        return regex.sub(replacement, html, count=1)
    return html.replace("</head>", f"    {replacement}\n  </head>")


def _truncate(value: str, limit: int = 240) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"
