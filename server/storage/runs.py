from __future__ import annotations

import json
import os
import re
import time
import uuid
import zipfile
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
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
    mode: str | None
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
        return data

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "RunRecord":
        created_ts = float(data.get("created_ts") or time.time())
        updated_ts = float(data.get("updated_ts") or created_ts)
        return RunRecord(
            run_id=data["run_id"],
            created_ts=created_ts,
            updated_ts=updated_ts,
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
        self, limit: int = 50, offset: int = 0, newest_first: bool = True
    ) -> List[RunRecord]: ...

    def delete_run(self, run_id: str) -> bool: ...


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

            fcntl.flock(handle, fcntl.LOCK_EX)
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
        with _locked(self.lock_path):
            _write_json_atomic(
                _run_json(run_id), json.dumps(record.to_dict(), indent=2)
            )
        return record

    def update_run(self, run_id: str, **updates: Any) -> Optional[RunRecord]:
        with _locked(self.lock_path):
            current = self.get_run(run_id)
            if not current:
                return None
            for key, value in updates.items():
                if value is None:
                    continue
                if hasattr(current, key):
                    setattr(current, key, value)
            current.updated_ts = time.time()
            _write_json_atomic(
                _run_json(run_id), json.dumps(current.to_dict(), indent=2)
            )
            return current

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
        self, limit: int = 50, offset: int = 0, newest_first: bool = True
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
        runs.sort(key=lambda r: r.created_ts, reverse=newest_first)
        start = max(offset, 0)
        end = start + max(1, limit)
        return runs[start:end]

    def delete_run(self, run_id: str) -> bool:
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


def list_runs(limit: int = 50, offset: int = 0) -> List[RunRecord]:
    return _current_store().list_runs(limit=limit, offset=offset, newest_first=True)


def delete_run(run_id: str) -> bool:
    return _current_store().delete_run(run_id)


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
