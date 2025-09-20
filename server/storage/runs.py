from __future__ import annotations

import json
import os
import re
import time
import uuid
import zipfile
from dataclasses import asdict, dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

RUNS_DIR = Path(os.getenv("GOLFIQ_RUNS_DIR", "data/runs")).resolve()
RUN_ID_RE = r"^[0-9]{10}-[0-9a-f]{8}$"


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    created_ts: float
    source: str
    mode: str
    params: Dict[str, Any]
    metrics: Dict[str, Any]
    events: List[int]
    impact_preview: Optional[str] = None


def _run_dir(run_id: str) -> Path:
    return RUNS_DIR / run_id


def _safe(run_id: str) -> Optional[Path]:
    if not re.fullmatch(RUN_ID_RE, run_id):
        return None
    resolved = (RUNS_DIR / run_id).resolve()
    root = RUNS_DIR.resolve()
    if not str(resolved).startswith(str(root)):
        return None
    try:
        resolved.relative_to(root)
    except ValueError:
        return None
    return resolved


def save_run(
    *,
    source: str,
    mode: str,
    params: Dict[str, Any],
    metrics: Dict[str, Any],
    events: List[int],
) -> RunRecord:
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    rid = f"{int(time.time())}-{uuid.uuid4().hex[:8]}"
    rec = RunRecord(rid, time.time(), source, mode, params, metrics, events)
    d = _run_dir(rid)
    d.mkdir(parents=True, exist_ok=True)
    (d / "run.json").write_text(json.dumps(asdict(rec), indent=2))
    return rec


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
    return str(out_path)


def load_run(run_id: str) -> Optional[RunRecord]:
    safe_dir = _safe(run_id)
    if not safe_dir:
        return None
    p = safe_dir / "run.json"
    if not p.exists():
        return None
    return RunRecord(**json.loads(p.read_text()))


def delete_run(run_id: str) -> bool:
    safe_dir = _safe(run_id)
    if not safe_dir:
        return False
    d = safe_dir
    if not d.exists():
        return False
    for c in d.iterdir():
        c.unlink()
    d.rmdir()
    return True


def list_runs(limit: int = 50) -> List[RunRecord]:
    if not RUNS_DIR.exists():
        return []
    out: List[RunRecord] = []
    for d in sorted(RUNS_DIR.iterdir(), reverse=True):
        p = d / "run.json"
        if p.exists():
            try:
                out.append(RunRecord(**json.loads(p.read_text())))
            except Exception:
                pass
        if len(out) >= max(1, limit):
            break
    return out
