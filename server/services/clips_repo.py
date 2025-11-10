"""In-memory repository helpers for shot clips."""

from __future__ import annotations

from typing import Any, Dict, Iterable, Mapping, MutableMapping


class ClipNotFoundError(LookupError):
    """Raised when a requested clip could not be located."""


_CLIP_STORE: MutableMapping[str, Dict[str, Any]] = {}


def register_clip(record: Mapping[str, Any]) -> None:
    """Register or update a clip in the in-memory store.

    This is primarily used in development and unit tests. Production deployments
    are expected to monkeypatch :func:`get_clip` with a real data access layer.
    """

    clip_id = str(record.get("id"))
    if not clip_id:
        raise ValueError("clip record requires an id")
    _CLIP_STORE[clip_id] = dict(record)


def get_clip(clip_id: str) -> Dict[str, Any]:
    """Retrieve a clip from the store."""

    clip = _CLIP_STORE.get(str(clip_id))
    if clip is None:
        raise ClipNotFoundError(str(clip_id))
    return dict(clip)


def list_for_event(event_id: str) -> Iterable[Dict[str, Any]]:
    """Iterate over clips registered for a specific event."""

    event_key = str(event_id)
    for clip in _CLIP_STORE.values():
        stored_event = clip.get("event_id") or clip.get("eventId")
        if stored_event is None:
            continue
        if str(stored_event) != event_key:
            continue
        yield dict(clip)


def update_ai_commentary(
    clip_id: str,
    *,
    title: str,
    summary: str,
    tts_url: str | None,
) -> None:
    """Persist generated commentary fields for a clip."""

    clip = _CLIP_STORE.setdefault(str(clip_id), {"id": str(clip_id)})
    clip["ai_title"] = title
    clip["ai_summary"] = summary
    clip["ai_tts_url"] = tts_url


def to_public(record: Mapping[str, Any]) -> Dict[str, Any]:
    """Map a clip record to the public representation returned by the API."""

    result: Dict[str, Any] = {
        "id": str(record.get("id")),
        "eventId": record.get("event_id") or record.get("eventId"),
        "playerId": record.get("player_id") or record.get("playerId"),
        "playerName": record.get("player_name") or record.get("playerName"),
        "videoUrl": record.get("video_url") or record.get("videoUrl"),
        "thumbnailUrl": record.get("thumbnail_url") or record.get("thumbnailUrl"),
        "createdAt": record.get("created_at") or record.get("createdAt"),
    }
    if "ai_title" in record or "aiTitle" in record:
        result["aiTitle"] = record.get("ai_title") or record.get("aiTitle")
    if "ai_summary" in record or "aiSummary" in record:
        result["aiSummary"] = record.get("ai_summary") or record.get("aiSummary")
    if "ai_tts_url" in record or "aiTtsUrl" in record:
        result["aiTtsUrl"] = record.get("ai_tts_url") or record.get("aiTtsUrl")
    return result


__all__ = [
    "ClipNotFoundError",
    "register_clip",
    "get_clip",
    "list_for_event",
    "update_ai_commentary",
    "to_public",
]
