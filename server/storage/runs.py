from __future__ import annotations

import json
import os
import re
import time
import uuid
import zipfile
from contextlib import contextmanager, nullcontext
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from enum import Enum
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol

import numpy as np

RUN_STORE_DIR = Path(
    os.getenv("RUN_STORE_DIR") or os.getenv("GOLFIQ_RUNS_DIR", "data/runs")
).resolve()
RUN_STORE_BACKEND = os.getenv("RUN_STORE_BACKEND", "file")
RUN_ID_RE = r"^[0-9a-fA-F-]{8,36}$"
RUNS_DIR = RUN_STORE_DIR


class RunStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class RunSourceType(str, Enum):
    ANALYZE = "analyze"
    ANALYZE_VIDEO = "analyze_video"
    RANGE = "range"
    LEGACY = "legacy"
    MOBILE = "mobile"


class VariantOverrideSource(str, Enum):
    ENV_DEFAULT = "env_default"
    HEADER = "header"
    FORM = "form"
    QUERY = "query"
    NONE = "none"
    PAYLOAD = "payload"


@dataclass
class RunRecord:
    run_id: str
    created_ts: float
    updated_ts: float
    status: RunStatus
    source: str
    source_type: str
    mode: str | None = None
    started_ts: float | None = None
    finished_ts: float | None = None
    params: Dict[str, Any] = field(default_factory=dict)
    metrics: Dict[str, Any] = field(default_factory=dict)
    events: List[int] = field(default_factory=list)
    model_variant_requested: str | None = None
    model_variant_selected: str | None = None
    override_source: str = VariantOverrideSource.NONE.value
    inference_timing: Dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    input_ref: Dict[str, Any] | None = None
    impact_preview: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def created_at(self) -> str:
        return datetime.fromtimestamp(self.created_ts, tz=timezone.utc).isoformat()

    @property
    def updated_at(self) -> str:
        return datetime.fromtimestamp(self.updated_ts, tz=timezone.utc).isoformat()

    @property
    def started_at(self) -> str | None:
        if self.started_ts is None:
            return None
        return datetime.fromtimestamp(self.started_ts, tz=timezone.utc).isoformat()

    @property
    def finished_at(self) -> str | None:
        if self.finished_ts is None:
            return None
        return datetime.fromtimestamp(self.finished_ts, tz=timezone.utc).isoformat()

    @property
    def kind(self) -> str | None:
        """Return a coarse run kind for filtering and UI affordances."""

        input_type = None
        if isinstance(self.input_ref, dict):
            input_type = self.input_ref.get("type")
            if input_type == "zip":
                return "image"
            if input_type in {"video", "range"}:
                return str(input_type)
        source_type = str(self.source_type)
        if source_type == RunSourceType.ANALYZE_VIDEO.value:
            return "video"
        if source_type == RunSourceType.RANGE.value:
            return "range"
        if source_type == RunSourceType.ANALYZE.value:
            return "image"
        return input_type

    @property
    def timing_summary(self) -> Dict[str, Any]:
        timing = self.inference_timing or {}
        total_ms = timing.get("total_ms") or timing.get("totalMs")
        avg_ms = timing.get("avg_ms_per_frame") or timing.get("avgInferenceMs")
        frames = timing.get("frame_count") or timing.get("frames")
        summary: Dict[str, Any] = {}
        if total_ms is not None:
            summary["total_ms"] = total_ms
        if avg_ms is not None:
            summary["avg_inference_ms"] = avg_ms
        if frames is not None:
            summary["frame_count"] = frames
        return summary

    def to_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["status"] = (
            self.status.value if isinstance(self.status, Enum) else self.status
        )
        data["override_source"] = (
            self.override_source.value
            if isinstance(self.override_source, Enum)
            else self.override_source
        )
        data["created_at"] = self.created_at
        data["updated_at"] = self.updated_at
        data["started_at"] = self.started_at
        data["finished_at"] = self.finished_at
        return data

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "RunRecord":
        created_ts = float(data.get("created_ts") or time.time())
        updated_ts = float(data.get("updated_ts") or created_ts)
        started_ts = data.get("started_ts")
        finished_ts = data.get("finished_ts")
        return RunRecord(
            run_id=data["run_id"],
            created_ts=created_ts,
            updated_ts=updated_ts,
            started_ts=float(started_ts) if started_ts is not None else None,
            finished_ts=float(finished_ts) if finished_ts is not None else None,
            status=RunStatus(data.get("status", RunStatus.SUCCEEDED.value)),
            source=data.get("source", "unknown"),
            source_type=data.get("source_type", RunSourceType.LEGACY.value),
            mode=data.get("mode"),
            params=data.get("params", {}) or {},
            metrics=data.get("metrics", {}) or {},
            events=data.get("events", []) or [],
            model_variant_requested=data.get("model_variant_requested"),
            model_variant_selected=data.get("model_variant_selected"),
            override_source=data.get(
                "override_source", VariantOverrideSource.NONE.value
            ),
            inference_timing=data.get("inference_timing"),
            error_code=data.get("error_code"),
            error_message=data.get("error_message"),
            input_ref=data.get("input_ref"),
            impact_preview=data.get("impact_preview"),
            metadata=data.get("metadata", {}) or {},
        )


class RunStore(Protocol):
    def create_run(self, **kwargs: Any) -> RunRecord: ...

    def update_run(self, run_id: str, **updates: Any) -> Optional[RunRecord]: ...

    def get_run(self, run_id: str) -> Optional[RunRecord]: ...

    def list_runs(
        self,
        limit: int = 50,
        offset: int = 0,
        newest_first: bool = True,
        status: str | RunStatus | None = None,
        kind: str | None = None,
        model_variant: str | None = None,
        cursor: tuple[float, str] | None = None,
    ) -> List[RunRecord]: ...

    def delete_run(self, run_id: str, *, locked: bool = False) -> bool: ...

    def prune_runs(
        self, *, max_runs: int | None = None, max_age_days: int | None = None
    ) -> dict[str, int]: ...


def _run_dir(run_id: str) -> Path:
    return RUN_STORE_DIR / run_id


def _run_json(run_id: str) -> Path:
    return _run_dir(run_id) / "run.json"


def _safe(run_id: str) -> Optional[Path]:
    if not re.fullmatch(RUN_ID_RE, run_id):
        return None
    resolved = (RUN_STORE_DIR / run_id).resolve()
    root = RUN_STORE_DIR.resolve()
    if not str(resolved).startswith(str(root)):
        return None
    try:
        resolved.relative_to(root)
    except ValueError:
        return None
    return resolved


@contextmanager
def _locked(lock_file: Path):
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    with lock_file.open("a+") as handle:
        try:
            import fcntl

            start = time.monotonic()
            while True:
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() - start > 5:
                        raise TimeoutError("run store lock acquisition timed out")
                    time.sleep(0.05)
            yield
        finally:
            try:
                import fcntl

                fcntl.flock(handle, fcntl.LOCK_UN)
            except Exception:
                pass


def _write_json_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


class RunTransitionError(ValueError):
    """Raised when an invalid run status transition is attempted."""


class FileRunStore(RunStore):
    def __init__(self, root: Path):
        self.root = root
        self.lock_path = root / ".runs.lock"

    def create_run(self, **kwargs: Any) -> RunRecord:
        now = time.time()
        run_id = kwargs.pop("run_id", str(uuid.uuid4()))
        status = kwargs.get("status", RunStatus.PROCESSING)
        status_enum = status if isinstance(status, RunStatus) else RunStatus(status)
        override_source = kwargs.get(
            "override_source", VariantOverrideSource.NONE.value
        )
        if isinstance(override_source, VariantOverrideSource):
            override_source_val = override_source.value
        else:
            override_source_val = override_source
        record = RunRecord(
            run_id=run_id,
            created_ts=now,
            updated_ts=now,
            status=status_enum,
            source=kwargs.get("source", "unknown"),
            source_type=kwargs.get("source_type", RunSourceType.LEGACY.value),
            mode=kwargs.get("mode"),
            params=kwargs.get("params", {}) or {},
            metrics=kwargs.get("metrics", {}) or {},
            events=kwargs.get("events", []) or [],
            model_variant_requested=kwargs.get("model_variant_requested"),
            model_variant_selected=kwargs.get("model_variant_selected"),
            override_source=override_source_val,
            inference_timing=kwargs.get("inference_timing"),
            error_code=kwargs.get("error_code"),
            error_message=kwargs.get("error_message"),
            input_ref=kwargs.get("input_ref"),
            impact_preview=kwargs.get("impact_preview"),
            metadata=kwargs.get("metadata", {}) or {},
        )
        if status_enum == RunStatus.PROCESSING:
            record.started_ts = now
        if status_enum in {RunStatus.SUCCEEDED, RunStatus.FAILED}:
            record.finished_ts = now
        with _locked(self.lock_path):
            _write_json_atomic(
                _run_json(run_id), json.dumps(record.to_dict(), indent=2)
            )
        return record

    def _validate_transition(
        self, current: RunStatus, target: RunStatus
    ) -> tuple[bool, str]:
        allowed: dict[RunStatus, set[RunStatus]] = {
            RunStatus.QUEUED: {
                RunStatus.QUEUED,
                RunStatus.PROCESSING,
                RunStatus.SUCCEEDED,
                RunStatus.FAILED,
            },
            RunStatus.PROCESSING: {
                RunStatus.PROCESSING,
                RunStatus.SUCCEEDED,
                RunStatus.FAILED,
            },
            RunStatus.SUCCEEDED: {RunStatus.SUCCEEDED},
            RunStatus.FAILED: {RunStatus.FAILED},
        }
        if target not in allowed.get(current, set()):
            return (
                False,
                f"invalid status transition {current.value}->{target.value}",
            )
        return True, ""

    def update_run(self, run_id: str, **updates: Any) -> Optional[RunRecord]:
        with _locked(self.lock_path):
            current = self.get_run(run_id)
            if not current:
                return None
            candidate = replace(current)
            status_update = updates.get("status")
            if status_update is None:
                target_status = candidate.status
            else:
                target_status = (
                    status_update
                    if isinstance(status_update, RunStatus)
                    else RunStatus(status_update)
                )
            is_valid, reason = self._validate_transition(candidate.status, target_status)
            if not is_valid:
                raise RunTransitionError(reason)
            for key, value in updates.items():
                if value is None:
                    continue
                if hasattr(candidate, key):
                    setattr(candidate, key, value)
            now = time.time()
            candidate.status = target_status
            candidate.updated_ts = now
            if candidate.status == RunStatus.PROCESSING and candidate.started_ts is None:
                candidate.started_ts = now
            if candidate.status in {RunStatus.SUCCEEDED, RunStatus.FAILED}:
                if candidate.finished_ts is None:
                    candidate.finished_ts = now
                if candidate.started_ts is None:
                    candidate.started_ts = candidate.created_ts
            _write_json_atomic(
                _run_json(run_id), json.dumps(candidate.to_dict(), indent=2)
            )
            return candidate

    def get_run(self, run_id: str) -> Optional[RunRecord]:
        safe_dir = _safe(run_id)
        if not safe_dir:
            return None
        path = _run_json(run_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text())
            return RunRecord.from_dict(data)
        except Exception:
            return None

    def list_runs(
        self,
        limit: int = 50,
        offset: int = 0,
        newest_first: bool = True,
        status: str | RunStatus | None = None,
        kind: str | None = None,
        model_variant: str | None = None,
        cursor: tuple[float, str] | None = None,
    ) -> List[RunRecord]:
        if not self.root.exists():
            return []
        runs: List[RunRecord] = []
        for entry in self.root.iterdir():
            if not entry.is_dir():
                continue
            run_file = entry / "run.json"
            if not run_file.exists():
                continue
            try:
                record = RunRecord.from_dict(json.loads(run_file.read_text()))
                runs.append(record)
            except Exception:
                continue
        runs.sort(
            key=lambda r: (r.created_ts, r.run_id), reverse=newest_first  # newest first
        )
        status_filter = (
            status.value
            if isinstance(status, RunStatus)
            else str(status).lower() if status else None
        )
        kind_filter = kind.lower() if kind else None
        variant_filter = model_variant.lower() if model_variant else None
        filtered: List[RunRecord] = []
        for record in runs:
            record_status = (
                record.status.value
                if isinstance(record.status, Enum)
                else str(record.status)
            ).lower()
            if status_filter and record_status != status_filter:
                continue
            record_kind = (record.kind or "").lower()
            if kind_filter and record_kind != kind_filter:
                continue
            if variant_filter and (
                (record.model_variant_selected or "").lower() != variant_filter
            ):
                continue
            if cursor:
                created_ts, cursor_run_id = cursor
                if record.created_ts > created_ts:
                    continue
                if record.created_ts == created_ts and record.run_id >= cursor_run_id:
                    continue
            filtered.append(record)
        runs = filtered
        start = max(offset, 0)
        end = start + max(1, limit)
        return runs[start:end]

    def delete_run(self, run_id: str, *, locked: bool = False) -> bool:
        with (_locked(self.lock_path) if not locked else nullcontext()):
            safe_dir = _safe(run_id)
            if not safe_dir:
                return False
            if not safe_dir.exists():
                return False
            for child in safe_dir.iterdir():
                if child.is_file():
                    child.unlink()
            safe_dir.rmdir()
            return True

    def _load_all(self) -> list[RunRecord]:
        if not self.root.exists():
            return []
        records: list[RunRecord] = []
        for entry in self.root.iterdir():
            if not entry.is_dir():
                continue
            run_file = entry / "run.json"
            if not run_file.exists():
                continue
            try:
                records.append(RunRecord.from_dict(json.loads(run_file.read_text())))
            except Exception:
                continue
        return records

    def prune_runs(
        self, *, max_runs: int | None = None, max_age_days: int | None = None
    ) -> dict[str, int]:
        with _locked(self.lock_path):
            records = self._load_all()
            scanned = len(records)
            if scanned == 0:
                return {"scanned": 0, "deleted": 0, "kept": 0}
            terminal_statuses = {RunStatus.SUCCEEDED.value, RunStatus.FAILED.value}
            now = time.time()
            max_age_seconds = (max_age_days or 0) * 86400 if max_age_days else None
            terminal_runs = [
                r
                for r in records
                if (
                    (r.status.value if isinstance(r.status, Enum) else str(r.status))
                    in terminal_statuses
                )
            ]
            terminal_runs.sort(key=lambda r: (r.created_ts, r.run_id), reverse=True)
            to_delete: set[str] = set()
            if max_runs is not None:
                allowed = max(0, int(max_runs))
                for r in terminal_runs[allowed:]:
                    to_delete.add(r.run_id)
            if max_age_seconds is not None and max_age_seconds > 0:
                cutoff = now - max_age_seconds
                for r in terminal_runs:
                    if r.created_ts < cutoff:
                        to_delete.add(r.run_id)
            deleted = 0
            for rid in to_delete:
                if self.delete_run(rid, locked=True):
                    deleted += 1
            kept = scanned - deleted
            return {"scanned": scanned, "deleted": deleted, "kept": kept}


def _store() -> RunStore:
    if RUN_STORE_BACKEND != "file":
        raise RuntimeError(f"Unsupported RUN_STORE_BACKEND '{RUN_STORE_BACKEND}'")
    return FileRunStore(RUN_STORE_DIR)


_DEFAULT_STORE = _store()


def create_run(**kwargs: Any) -> RunRecord:
    return _current_store().create_run(**kwargs)


def update_run(run_id: str, **updates: Any) -> Optional[RunRecord]:
    return _current_store().update_run(run_id, **updates)


def get_run(run_id: str) -> Optional[RunRecord]:
    return _current_store().get_run(run_id)


def list_runs(
    limit: int = 50,
    offset: int = 0,
    *,
    status: str | RunStatus | None = None,
    kind: str | None = None,
    model_variant: str | None = None,
    cursor: tuple[float, str] | None = None,
) -> List[RunRecord]:
    return _current_store().list_runs(
        limit=limit,
        offset=offset,
        newest_first=True,
        status=status,
        kind=kind,
        model_variant=model_variant,
        cursor=cursor,
    )


def delete_run(run_id: str, *, locked: bool = False) -> bool:
    return _current_store().delete_run(run_id, locked=locked)


def _resolve_prune_limits(
    *, max_runs: int | None = None, max_age_days: int | None = None
) -> tuple[int | None, int | None]:
    env_max_runs = os.getenv("RUNS_PRUNE_MAX_RUNS")
    env_max_age = os.getenv("RUNS_PRUNE_MAX_AGE_DAYS")
    resolved_max_runs = max_runs
    resolved_max_age = max_age_days
    if resolved_max_runs is None and env_max_runs:
        try:
            resolved_max_runs = int(env_max_runs)
        except ValueError:
            resolved_max_runs = None
    if resolved_max_age is None and env_max_age:
        try:
            resolved_max_age = int(env_max_age)
        except ValueError:
            resolved_max_age = None
    return resolved_max_runs, resolved_max_age


def prune_runs(
    *, max_runs: int | None = None, max_age_days: int | None = None
) -> dict[str, int]:
    resolved_max_runs, resolved_max_age = _resolve_prune_limits(
        max_runs=max_runs, max_age_days=max_age_days
    )
    return _current_store().prune_runs(
        max_runs=resolved_max_runs, max_age_days=resolved_max_age
    )


def save_run(
    *,
    source: str,
    mode: str | None,
    params: Dict[str, Any],
    metrics: Dict[str, Any],
    events: List[int],
) -> RunRecord:
    """Compatibility wrapper for legacy callers."""

    return create_run(
        source=source,
        source_type=RunSourceType.LEGACY.value,
        mode=mode,
        status=RunStatus.SUCCEEDED,
        params=params,
        metrics=metrics,
        events=events,
    )


def load_run(run_id: str) -> Optional[RunRecord]:
    return get_run(run_id)


def save_impact_frames(run_id: str, frames) -> str:
    run_dir = _run_dir(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    out_path = run_dir / "impact_preview.zip"
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, frame in enumerate(frames):
            try:
                arr = np.asarray(frame)
            except Exception:
                continue
            if arr.dtype == object:
                continue
            buffer = BytesIO()
            np.save(buffer, arr, allow_pickle=False)
            zf.writestr(f"{idx:03d}.npy", buffer.getvalue())
    update_run(run_id, impact_preview=str(out_path))
    return str(out_path)


def _reset_store_for_tests(root: Path) -> None:  # pragma: no cover - test helper
    global _DEFAULT_STORE, RUN_STORE_DIR, RUNS_DIR
    RUN_STORE_DIR = root
    RUNS_DIR = root
    _DEFAULT_STORE = FileRunStore(root)


def _current_store() -> RunStore:
    global RUN_STORE_DIR, RUNS_DIR, _DEFAULT_STORE
    env_dir = os.getenv("RUN_STORE_DIR") or os.getenv("GOLFIQ_RUNS_DIR")
    if env_dir:
        resolved = Path(env_dir).resolve()
        if resolved != RUN_STORE_DIR:
            RUN_STORE_DIR = resolved
            RUNS_DIR = resolved
            _DEFAULT_STORE = FileRunStore(RUN_STORE_DIR)
    if getattr(_DEFAULT_STORE, "root", None) != RUN_STORE_DIR:
        _DEFAULT_STORE = FileRunStore(RUN_STORE_DIR)
    return _DEFAULT_STORE
