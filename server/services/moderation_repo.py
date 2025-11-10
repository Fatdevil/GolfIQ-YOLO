"""In-memory repository for clip moderation state and reports."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, MutableMapping
from uuid import uuid4

from server.schemas.moderation import (
    ClipModerationState,
    ModerationAction,
    ReportOut,
    Visibility,
)

_ReportRecord = Dict[str, Any]
_StateRecord = MutableMapping[str, Any]

_REPORTS: Dict[str, _ReportRecord] = {}
_CLIP_STATE: Dict[str, _StateRecord] = {}
_OPEN_REPORTS: Dict[str, set[str]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _log_root() -> Path:
    base = Path(os.getenv("MODERATION_DATA_DIR", "data/moderation")).resolve()
    base.mkdir(parents=True, exist_ok=True)
    return base


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, Visibility):
        return value.value
    return value


def _append_event(record: Dict[str, Any]) -> None:
    day = _now().strftime("%Y-%m-%d")
    path = _log_root() / f"{day}.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(record, ensure_ascii=False, default=_json_default) + "\n"
        )


def reset() -> None:
    """Reset in-memory state (used in tests)."""

    _REPORTS.clear()
    _CLIP_STATE.clear()
    _OPEN_REPORTS.clear()


def _ensure_state(clip_id: str) -> _StateRecord:
    clip_key = str(clip_id)
    state = _CLIP_STATE.get(clip_key)
    if state is None:
        state = {
            "clipId": clip_key,
            "hidden": False,
            "visibility": Visibility.public,
            "updatedTs": _now(),
            "openReports": set(),
        }
        _CLIP_STATE[clip_key] = state
        _OPEN_REPORTS[clip_key] = set()
    else:
        state.setdefault("openReports", _OPEN_REPORTS.get(clip_key, set()))
    return state


def _state_to_model(state: _StateRecord) -> ClipModerationState:
    return ClipModerationState(
        clipId=str(state["clipId"]),
        hidden=bool(state.get("hidden", False)),
        visibility=Visibility(state.get("visibility", Visibility.public)),
        reports=len(state.get("openReports", set())),
        updatedTs=state.get("updatedTs", _now()),
    )


def _update_open_reports(clip_id: str, open_ids: Iterable[str]) -> None:
    clip_key = str(clip_id)
    bucket = _OPEN_REPORTS.setdefault(clip_key, set())
    bucket.clear()
    bucket.update(open_ids)
    state = _CLIP_STATE.get(clip_key)
    if state is not None:
        state["openReports"] = bucket


def record_report(
    clip_id: str,
    *,
    reason: str,
    details: Dict[str, Any] | None = None,
    reporter: str | None = None,
) -> ReportOut:
    clip_key = str(clip_id)
    report_id = uuid4().hex
    now = _now()
    record: _ReportRecord = {
        "id": report_id,
        "clipId": clip_key,
        "ts": now,
        "reason": reason,
        "status": "open",
    }
    if details:
        record["details"] = details
    if reporter:
        record["reporter"] = reporter
    _REPORTS[report_id] = record

    state = _ensure_state(clip_key)
    state["updatedTs"] = now
    open_reports = set(state.get("openReports", set()))
    open_reports.add(report_id)
    _update_open_reports(clip_key, open_reports)

    _append_event(
        {
            "type": "report",
            "clipId": clip_key,
            "id": report_id,
            "reason": reason,
            "details": details,
            "reporter": reporter,
            "status": "open",
            "ts": now,
        }
    )

    return ReportOut.model_validate(record)


def list_queue(status: str = "open") -> list[ClipModerationState]:
    """Return moderation state for clips filtered by report status."""

    items: list[ClipModerationState] = []
    status_normalized = (status or "").lower()
    for state in _CLIP_STATE.values():
        model = _state_to_model(state)
        if status_normalized == "open" and model.reports == 0:
            continue
        items.append(model)
    items.sort(key=lambda item: item.updatedTs, reverse=True)
    return items


def get_state(clip_id: str) -> ClipModerationState:
    state = _ensure_state(clip_id)
    return _state_to_model(state)


def is_hidden(clip_id: str) -> bool:
    return bool(_ensure_state(clip_id).get("hidden", False))


def resolve_visibility(clip_id: str) -> Visibility:
    state = _ensure_state(clip_id)
    visibility = state.get("visibility", Visibility.public)
    return visibility if isinstance(visibility, Visibility) else Visibility(visibility)


def _close_reports(clip_key: str, *, now: datetime | None = None) -> set[str]:
    bucket = set(_OPEN_REPORTS.get(clip_key, set()))
    if not bucket:
        return set()
    timestamp = now or _now()
    for report_id in bucket:
        report = _REPORTS.get(report_id)
        if report is None:
            continue
        report["status"] = "resolved"
        report["resolvedTs"] = timestamp
    _update_open_reports(clip_key, set())
    return bucket


def apply_action(
    clip_id: str,
    *,
    action: ModerationAction,
    visibility: Visibility | None = None,
    performed_by: str | None = None,
) -> ClipModerationState:
    clip_key = str(clip_id)
    state = _ensure_state(clip_key)
    now = _now()
    changed = False

    if action is ModerationAction.hide:
        if not state.get("hidden", False):
            state["hidden"] = True
            changed = True
    elif action is ModerationAction.unhide:
        if state.get("hidden", False):
            state["hidden"] = False
            changed = True
    elif action is ModerationAction.set_visibility:
        if visibility is None:
            raise ValueError("visibility required for set_visibility action")
        current = state.get("visibility", Visibility.public)
        if not isinstance(current, Visibility):
            current = Visibility(str(current))
        if current != visibility:
            state["visibility"] = visibility
            changed = True
    else:  # pragma: no cover - defensive
        raise ValueError(f"unsupported action: {action}")

    closed = _close_reports(clip_key, now=now)
    if changed or closed:
        state["updatedTs"] = now
        _append_event(
            {
                "type": "action",
                "clipId": clip_key,
                "action": action.value,
                "hidden": bool(state.get("hidden", False)),
                "visibility": state.get("visibility", Visibility.public),
                "performedBy": performed_by,
                "closedReports": sorted(closed),
                "ts": now,
            }
        )

    return _state_to_model(state)


__all__ = [
    "record_report",
    "list_queue",
    "get_state",
    "apply_action",
    "is_hidden",
    "resolve_visibility",
    "reset",
]
