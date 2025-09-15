from __future__ import annotations

import json
import os
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

RUNS_DIR = Path(os.getenv("GOLFIQ_RUNS_DIR", "data/runs")).resolve()


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    created_ts: float
    source: str
    mode: str
    params: Dict[str, Any]
    metrics: Dict[str, Any]
    events: List[int]


def _dir(run_id: str) -> Path:
    return RUNS_DIR / run_id


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
    d = _dir(rid)
    d.mkdir(parents=True, exist_ok=True)
    (d / "run.json").write_text(json.dumps(asdict(rec), indent=2))
    return rec


def load_run(run_id: str) -> Optional[RunRecord]:
    p = _dir(run_id) / "run.json"
    if not p.exists():
        return None
    return RunRecord(**json.loads(p.read_text()))


def delete_run(run_id: str) -> bool:
    d = _dir(run_id)
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
