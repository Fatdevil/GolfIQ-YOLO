"""In-memory repository tracking clip commentary status."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, MutableMapping, Optional

from server.schemas.commentary import ClipCommentaryOut, CommentaryStatus

_Record = MutableMapping[str, object]

_STORE: Dict[str, _Record] = {}
_EVENT_INDEX: Dict[str, set[str]] = {}

_MISSING = object()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def reset() -> None:
    """Clear the in-memory store (used in tests)."""

    _STORE.clear()
    _EVENT_INDEX.clear()


def _ensure_record(clip_id: str, *, event_id: str | None = None) -> _Record:
    clip_id = str(clip_id)
    record = _STORE.get(clip_id)
    if record is None:
        if not event_id:
            raise ValueError("event_id required for new commentary record")
        record = {"clipId": clip_id, "eventId": event_id}
        _STORE[clip_id] = record
        _EVENT_INDEX.setdefault(event_id, set()).add(clip_id)
    else:
        if event_id and record.get("eventId") != event_id:
            old_event = str(record.get("eventId")) if record.get("eventId") else None
            if old_event:
                bucket = _EVENT_INDEX.get(old_event)
                if bucket is not None:
                    bucket.discard(clip_id)
            record["eventId"] = event_id
            _EVENT_INDEX.setdefault(event_id, set()).add(clip_id)
    return record


def upsert(
    clip_id: str,
    *,
    event_id: str | None = None,
    status: CommentaryStatus,
    title: str | None | object = _MISSING,
    summary: str | None | object = _MISSING,
    tts_url: str | None | object = _MISSING,
    updated_ts: datetime | None = None,
) -> ClipCommentaryOut:
    """Insert or update a commentary record."""

    record = _ensure_record(clip_id, event_id=event_id)
    record["status"] = status
    if title is not _MISSING:
        record["title"] = title
    if summary is not _MISSING:
        record["summary"] = summary
    if tts_url is not _MISSING:
        record["ttsUrl"] = tts_url
    record["updatedTs"] = updated_ts or _now()
    return ClipCommentaryOut.model_validate(
        {
            "clipId": record["clipId"],
            "status": record["status"],
            "title": record.get("title"),
            "summary": record.get("summary"),
            "ttsUrl": record.get("ttsUrl"),
            "updatedTs": record["updatedTs"],
        }
    )


def get(clip_id: str) -> ClipCommentaryOut:
    """Retrieve a commentary record by clip id."""

    record = _STORE.get(str(clip_id))
    if record is None:
        raise KeyError(str(clip_id))
    return ClipCommentaryOut.model_validate(
        {
            "clipId": record["clipId"],
            "status": record["status"],
            "title": record.get("title"),
            "summary": record.get("summary"),
            "ttsUrl": record.get("ttsUrl"),
            "updatedTs": record["updatedTs"],
        }
    )


def list_for_event(
    event_id: str,
    *,
    status: CommentaryStatus | None = None,
) -> list[ClipCommentaryOut]:
    """Return commentary records for an event, optionally filtered by status."""

    clip_ids = list(_EVENT_INDEX.get(str(event_id), set()))
    if not clip_ids:
        return []
    items: list[ClipCommentaryOut] = []
    for clip_id in clip_ids:
        record = _STORE.get(clip_id)
        if not record:
            continue
        if status is not None and record.get("status") != status:
            continue
        items.append(
            ClipCommentaryOut.model_validate(
                {
                    "clipId": record["clipId"],
                    "status": record["status"],
                    "title": record.get("title"),
                    "summary": record.get("summary"),
                    "ttsUrl": record.get("ttsUrl"),
                    "updatedTs": record["updatedTs"],
                }
            )
        )
    items.sort(key=lambda item: item.updatedTs, reverse=True)
    return items


def resolve_event_id(clip_id: str) -> str | None:
    record = _STORE.get(str(clip_id))
    if record is None:
        return None
    event_id = record.get("eventId")
    return str(event_id) if event_id is not None else None


__all__ = ["reset", "upsert", "get", "list_for_event", "resolve_event_id"]
