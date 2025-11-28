"""Compose a lightweight, text-first session timeline for a run.

The v1 implementation stitches together the most readily available signals:
- impact frames from persisted CV runs
- kinematic sequence peak frames
- SG anchors for hole transitions
- optional mission metadata

If a source is missing, it is silently skipped so the timeline always returns a
best-effort view instead of failing hard.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Mapping, MutableMapping, Optional, Sequence

from server.schemas.anchors import AnchorOut
from server.schemas.session_timeline import SessionTimeline, TimelineEvent
from server.services.anchors_store import list_run as list_run_anchors
from server.storage.runs import RunRecord, load_run

try:  # pragma: no cover - optional mission labels
    from server.services.coach_summary import MISSION_LABELS
except Exception:  # pragma: no cover - defensive fallback
    MISSION_LABELS: Mapping[str, str] = {}


class RunNotFoundError(RuntimeError):
    """Raised when a run_id cannot be resolved to a stored RunRecord."""


@dataclass(frozen=True)
class _EventCandidate:
    ts: float
    type: str
    label: Optional[str]
    data: Optional[MutableMapping[str, object]] = None


def _coerce_number(value: object) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _frame_to_seconds(frame: object, fps: float) -> Optional[float]:
    frame_idx = _coerce_number(frame)
    if frame_idx is None or fps <= 0:
        return None
    return frame_idx / fps


def _sequence_events(
    seq_metrics: Mapping[str, object] | None, fps: float
) -> List[_EventCandidate]:
    if not isinstance(seq_metrics, Mapping):
        return []

    def first_number(keys: Sequence[str]) -> Optional[float]:
        for key in keys:
            value = _coerce_number(seq_metrics.get(key))
            if value is not None:
                return value
        return None

    hips_frame = first_number(["hipPeakFrame", "hip_peak_frame", "hips_peak_frame"])
    shoulders_frame = first_number(
        ["shoulderPeakFrame", "shoulder_peak_frame", "shoulders_peak_frame"]
    )

    events: List[_EventCandidate] = []
    hips_ts = _frame_to_seconds(hips_frame, fps)
    if hips_ts is not None:
        events.append(
            _EventCandidate(ts=hips_ts, type="peak_hips", label="Hips peak", data=None)
        )

    shoulders_ts = _frame_to_seconds(shoulders_frame, fps)
    if shoulders_ts is not None:
        events.append(
            _EventCandidate(
                ts=shoulders_ts,
                type="peak_shoulders",
                label="Shoulders peak",
                data=None,
            )
        )

    tempo_block = seq_metrics.get("tempo") if isinstance(seq_metrics, Mapping) else None
    if isinstance(tempo_block, Mapping):
        tempo_total = _coerce_number(
            tempo_block.get("total_s")
            or tempo_block.get("total_seconds")
            or tempo_block.get("tempo_s")
        )
        if tempo_total is not None:
            events.append(
                _EventCandidate(
                    ts=tempo_total,
                    type="tempo_marker",
                    label="Tempo marker",
                    data={"total_s": tempo_total},
                )
            )

    return events


def _impact_events(run: RunRecord, fps: float) -> List[_EventCandidate]:
    events: List[_EventCandidate] = []
    for idx, frame in enumerate(run.events or []):
        ts = _frame_to_seconds(frame, fps)
        if ts is None:
            continue
        events.append(
            _EventCandidate(
                ts=ts, type="impact", label=f"Impact #{idx + 1}", data={"frame": frame}
            )
        )
    return events


def _hole_transition_events(anchors: Iterable[AnchorOut]) -> List[_EventCandidate]:
    grouped: MutableMapping[int, List[AnchorOut]] = {}
    for anchor in anchors:
        grouped.setdefault(anchor.hole, []).append(anchor)

    events: List[_EventCandidate] = []
    holes = sorted(grouped)
    for idx in range(len(holes) - 1):
        current = holes[idx]
        nxt = holes[idx + 1]
        current_shots = grouped[current]
        next_shots = grouped[nxt]

        current_end_ms = max(
            (a.tEndMs if a.tEndMs is not None else a.tStartMs for a in current_shots),
            default=None,
        )
        next_start_ms = min(
            (a.tStartMs for a in next_shots if a.tStartMs is not None), default=None
        )

        if current_end_ms is None or next_start_ms is None:
            continue

        midpoint_s = ((current_end_ms + next_start_ms) / 2.0) / 1000.0
        events.append(
            _EventCandidate(
                ts=midpoint_s,
                type="hole_transition",
                label=f"Hole {current} → Hole {nxt}",
                data={"from_hole": current, "to_hole": nxt},
            )
        )
    return events


def _mission_events(run: RunRecord) -> List[_EventCandidate]:
    params = run.params or {}
    metrics = run.metrics or {}
    mission_block = metrics.get("mission") if isinstance(metrics, Mapping) else None
    mission_id = params.get("missionId") or params.get("mission_id")
    mission_label = None
    mission_success: Optional[bool] = None

    if isinstance(mission_block, Mapping):
        mission_id = mission_block.get("id") or mission_id
        mission_label = mission_block.get("label")
        success_value = mission_block.get("success")
        if isinstance(success_value, bool):
            mission_success = success_value

    mission_label = mission_label or MISSION_LABELS.get(mission_id)
    success_flag = mission_success
    if success_flag is None and isinstance(metrics.get("mission_success"), bool):
        success_flag = bool(metrics.get("mission_success"))

    if not (mission_id or mission_label or success_flag is not None):
        return []

    label = mission_label or (
        f"Mission: {mission_id}" if mission_id else "Mission event"
    )
    return [
        _EventCandidate(
            ts=0.0,
            type="mission_event",
            label=label,
            data={"mission_id": mission_id, "success": success_flag},
        )
    ]


def _fps_for_run(run: RunRecord) -> float:
    params = run.params or {}
    metrics = run.metrics or {}
    fps = _coerce_number(
        params.get("fps") or metrics.get("fps") or metrics.get("frame_rate")
    )
    return fps or 120.0


def _normalize(events: List[_EventCandidate]) -> List[TimelineEvent]:
    if not events:
        return []

    events.sort(key=lambda e: e.ts)
    start_ts = events[0].ts
    normalized: List[TimelineEvent] = []
    for event in events:
        normalized.append(
            TimelineEvent(
                ts=max(0.0, event.ts - start_ts),
                type=event.type,  # type: ignore[arg-type]
                label=event.label,
                data=dict(event.data) if event.data else None,
            )
        )
    return normalized


def build_session_timeline(run_id: str) -> SessionTimeline:
    run = load_run(run_id)
    if not run:
        raise RunNotFoundError(f"Unknown run_id: {run_id}")

    fps = _fps_for_run(run)
    seq_metrics = (
        run.metrics.get("sequence") if isinstance(run.metrics, Mapping) else None
    )
    anchors = list_run_anchors(run_id)

    candidates: List[_EventCandidate] = []
    candidates.extend(_mission_events(run))
    candidates.extend(_impact_events(run, fps))
    candidates.extend(_sequence_events(seq_metrics, fps))
    candidates.extend(_hole_transition_events(anchors))

    timeline_events = _normalize(candidates)
    return SessionTimeline(run_id=run_id, events=timeline_events)


def summarize_timeline(timeline: SessionTimeline, max_events: int = 5) -> List[str]:
    """Return a compact list of human-friendly timeline bullet points."""

    lines: List[str] = []
    for event in timeline.events[: max_events if max_events > 0 else None]:
        label = event.label or event.type.replace("_", " ").title()
        lines.append(f"{event.ts:.2f}s – {label}")
    return lines


__all__ = [
    "RunNotFoundError",
    "SessionTimeline",
    "TimelineEvent",
    "build_session_timeline",
    "summarize_timeline",
]
