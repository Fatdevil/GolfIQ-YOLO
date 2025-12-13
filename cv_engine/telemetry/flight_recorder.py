from __future__ import annotations

import math
import os
import random
from statistics import mean
from typing import Any, Dict, List, MutableMapping


class FlightRecorder:
    """Lightweight, opt-in telemetry collector for cv_engine sessions.

    Enable by setting ``CV_FLIGHT_RECORDER_ENABLED=1`` (optionally also
    ``CV_FLIGHT_RECORDER_SAMPLE_RATE`` for probabilistic enabling and
    ``CV_FLIGHT_RECORDER_FRAME_STRIDE`` to sample frames). When enabled, the
    recorder tracks per-frame summaries, shot segmentation events, and
    aggregated metrics that can be stored alongside session results for
    debugging. The resulting payload is attached to cv_engine pipeline
    results under the ``flight_recorder`` key for offline inspection.
    When disabled, all public methods are inexpensive no-ops.
    """

    def __init__(
        self,
        *,
        enabled: bool,
        session_metadata: MutableMapping[str, Any] | None = None,
        frame_sample_rate: int = 1,
    ) -> None:
        self.enabled = enabled
        self.metadata: Dict[str, Any] = dict(session_metadata or {}) if enabled else {}
        self.frame_sample_rate = max(1, int(frame_sample_rate)) if enabled else 1
        self.frames: List[Dict[str, Any]] = [] if enabled else []
        self.shots: List[Dict[str, Any]] = [] if enabled else []
        self.events: List[Dict[str, Any]] = [] if enabled else []
        self.status: str | None = None

        # Aggregation fields
        self._frame_count = 0
        self._dropped_frames = 0
        self._current_dropped_streak = 0
        self._max_dropped_streak = 0
        self._inference_ms: List[float] = []
        self._max_ball_tracks = 0
        self._max_club_tracks = 0

    def record_frame(
        self,
        frame_index: int,
        *,
        ts: float | None = None,
        inference_ms: float | None = None,
        detections: int | None = None,
        ball_tracks: int | None = None,
        club_tracks: int | None = None,
        dropped: bool = False,
    ) -> None:
        if not self.enabled:
            return

        self._frame_count += 1
        if dropped:
            self._dropped_frames += 1
            self._current_dropped_streak += 1
        else:
            self._current_dropped_streak = 0
        self._max_dropped_streak = max(
            self._max_dropped_streak, self._current_dropped_streak
        )

        if inference_ms is not None:
            self._inference_ms.append(float(inference_ms))
        if ball_tracks is not None:
            self._max_ball_tracks = max(self._max_ball_tracks, int(ball_tracks))
        if club_tracks is not None:
            self._max_club_tracks = max(self._max_club_tracks, int(club_tracks))

        if frame_index % self.frame_sample_rate != 0:
            return

        frame_entry = {"frameIndex": int(frame_index), "dropped": bool(dropped)}
        if ts is not None:
            frame_entry["ts"] = float(ts)
        if inference_ms is not None:
            frame_entry["inferenceMs"] = float(inference_ms)
        if detections is not None:
            frame_entry["detections"] = int(detections)
        if ball_tracks is not None:
            frame_entry["ballTracks"] = int(ball_tracks)
        if club_tracks is not None:
            frame_entry["clubTracks"] = int(club_tracks)
        self.frames.append(frame_entry)

    def record_shot(
        self,
        shot_index: int,
        *,
        start_frame: int,
        end_frame: int,
        classification: str | None = None,
        confidence: float | None = None,
    ) -> None:
        if not self.enabled:
            return
        shot_entry: Dict[str, Any] = {
            "shotIndex": int(shot_index),
            "startFrame": int(start_frame),
            "endFrame": int(end_frame),
        }
        if classification is not None:
            shot_entry["classification"] = classification
        if confidence is not None:
            shot_entry["confidence"] = float(confidence)
        self.shots.append(shot_entry)

    def record_event(self, kind: str, data: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        self.events.append({"kind": kind, "data": dict(data)})

    def set_status(self, status: str) -> None:
        if not self.enabled:
            return
        self.status = status

    def _summary(self) -> Dict[str, Any]:
        if not self.enabled:
            return {}
        inference_ms = sorted(self._inference_ms)
        p95 = None
        if inference_ms:
            idx = math.ceil(0.95 * (len(inference_ms) - 1))
            p95 = inference_ms[idx]
        fallback_modes = {
            event["data"].get("mode")
            for event in self.events
            if event.get("kind") == "fallback" and isinstance(event.get("data"), dict)
        } - {None}
        return {
            "frameCount": self._frame_count,
            "shotCount": len(self.shots),
            "avgInferenceMs": mean(self._inference_ms) if self._inference_ms else None,
            "p95InferenceMs": p95,
            "droppedFrames": self._dropped_frames,
            "maxDroppedStreak": self._max_dropped_streak,
            "maxConcurrentBallTracks": self._max_ball_tracks or None,
            "maxConcurrentClubTracks": self._max_club_tracks or None,
            "fallbackModesUsed": sorted(fallback_modes),
        }

    def to_dict(self) -> Dict[str, Any]:
        if not self.enabled:
            return {
                "metadata": {},
                "frames": [],
                "shots": [],
                "events": [],
                "status": self.status,
                "summary": None,
            }
        return {
            "metadata": self.metadata,
            "frames": self.frames,
            "shots": self.shots,
            "events": self.events,
            "status": self.status,
            "summary": self._summary(),
        }


FALSE_VALUES = {"0", "false", "False", "", None}


def _is_enabled_flag(raw: str | None) -> bool:
    return raw not in FALSE_VALUES


def flight_recorder_settings() -> tuple[bool, int]:
    """Derive flight recorder settings from environment variables.

    - ``CV_FLIGHT_RECORDER_ENABLED`` toggles the feature.
    - ``CV_FLIGHT_RECORDER_SAMPLE_RATE`` (0.0-1.0) enables a percentage of sessions.
    - ``CV_FLIGHT_RECORDER_FRAME_STRIDE`` controls per-frame sampling.
    """

    enabled_flag = _is_enabled_flag(os.getenv("CV_FLIGHT_RECORDER_ENABLED"))
    sample_rate_raw = os.getenv("CV_FLIGHT_RECORDER_SAMPLE_RATE")
    frame_stride_raw = os.getenv("CV_FLIGHT_RECORDER_FRAME_STRIDE")
    frame_stride = int(frame_stride_raw) if frame_stride_raw else 1

    if enabled_flag and sample_rate_raw:
        try:
            sample_rate = float(sample_rate_raw)
            if sample_rate < 0.0:
                sample_rate = 0.0
            if sample_rate > 1.0:
                sample_rate = 1.0
        except ValueError:
            sample_rate = 1.0
        if sample_rate < 1.0 and random.random() > sample_rate:
            enabled_flag = False
    return enabled_flag, max(1, frame_stride)
