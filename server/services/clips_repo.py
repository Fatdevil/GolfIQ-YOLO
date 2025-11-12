"""In-memory repository helpers for shot clips."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Iterator, Mapping, MutableMapping

from server.services import anchors_store
from server.utils.media import resolve_thumb_url, rewrite_media_url


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
    stored = dict(record)
    anchors = record.get("anchors") or record.get("anchorsSec")
    if anchors is not None and not isinstance(anchors, list):
        try:
            anchors_list = list(anchors)
        except TypeError:
            anchors_list = [anchors]
        stored["anchors"] = anchors_list
    _CLIP_STORE[clip_id] = stored


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


def list_recent(limit: int | None = None) -> Iterable[Dict[str, Any]]:
    """Iterate over clips sorted by newest creation timestamp first."""

    items: list[tuple[float, Dict[str, Any]]] = []
    for clip in _CLIP_STORE.values():
        items.append((_created_ts(clip), dict(clip)))

    items.sort(key=lambda item: item[0], reverse=True)

    def _iterator() -> Iterator[Dict[str, Any]]:
        count = 0
        for _, record in items:
            if limit is not None and count >= limit:
                break
            count += 1
            yield record

    return _iterator()


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

    raw_video = record.get("video_url") or record.get("videoUrl")
    raw_thumbnail = record.get("thumbnail_url") or record.get("thumbnailUrl")

    video_url = rewrite_media_url(str(raw_video)) if raw_video else None
    thumbnail_url = rewrite_media_url(str(raw_thumbnail)) if raw_thumbnail else None
    thumb_url = resolve_thumb_url(record)
    if thumbnail_url is None:
        thumbnail_url = thumb_url

    result: Dict[str, Any] = {
        "id": str(record.get("id")),
        "eventId": record.get("event_id") or record.get("eventId"),
        "playerId": record.get("player_id") or record.get("playerId"),
        "playerName": record.get("player_name") or record.get("playerName"),
        "videoUrl": video_url,
        "thumbnailUrl": thumbnail_url,
        "thumbUrl": thumb_url,
        "createdAt": record.get("created_at") or record.get("createdAt"),
    }
    if "ai_title" in record or "aiTitle" in record:
        result["aiTitle"] = record.get("ai_title") or record.get("aiTitle")
    if "ai_summary" in record or "aiSummary" in record:
        result["aiSummary"] = record.get("ai_summary") or record.get("aiSummary")
    if "ai_tts_url" in record or "aiTtsUrl" in record:
        result["aiTtsUrl"] = record.get("ai_tts_url") or record.get("aiTtsUrl")
    if "sg_delta" in record or "sgDelta" in record:
        try:
            result["sgDelta"] = float(record.get("sg_delta") or record.get("sgDelta"))
        except (TypeError, ValueError):
            result["sgDelta"] = None
    anchors = record.get("anchors") or record.get("anchorsSec")
    if anchors is not None:
        result["anchors"] = [float(a) for a in anchors if _is_number(a)]
    clip_id = str(record.get("id")) if record.get("id") is not None else None
    if clip_id:
        anchor_refs = [
            {
                "runId": anchor.runId,
                "hole": anchor.hole,
                "shot": anchor.shot,
                "tStartMs": anchor.tStartMs,
                "tEndMs": anchor.tEndMs,
            }
            for anchor in anchors_store.list_by_clip(clip_id)
        ]
        if anchor_refs:
            result["anchorRefs"] = anchor_refs
    return result


def update_metrics(
    clip_id: str,
    *,
    sg_delta: float | None = None,
    anchors: Iterable[float] | None = None,
) -> None:
    """Persist derived metrics for a clip."""

    clip = _CLIP_STORE.setdefault(str(clip_id), {"id": str(clip_id)})
    if sg_delta is not None:
        clip["sg_delta"] = float(sg_delta)
    if anchors is not None:
        clip["anchors"] = [float(value) for value in anchors]


def _is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _created_ts(record: Mapping[str, Any]) -> float:
    value = record.get("created_at") or record.get("createdAt")
    if value is None:
        return 0.0
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return 0.0
        return (
            dt.timestamp() if dt.tzinfo else dt.replace(tzinfo=timezone.utc).timestamp()
        )
    return 0.0


__all__ = [
    "ClipNotFoundError",
    "register_clip",
    "get_clip",
    "list_for_event",
    "list_recent",
    "update_metrics",
    "update_ai_commentary",
    "to_public",
]
