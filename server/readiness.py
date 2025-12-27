from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

from server.feature_flag_config_store import resolve_config_path, store
from server.storage.s3signer import get_presigned_put


@dataclass
class CheckResult:
    name: str
    status: str
    detail: str | None = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            **({"detail": self.detail} if self.detail else {}),
        }


def _check_writable_dir(name: str, raw_path: str) -> CheckResult:
    path = Path(raw_path).expanduser()
    try:
        path.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=path, prefix="ready-", suffix=".tmp", delete=True
        ) as handle:
            handle.write(b"ok")
            handle.flush()
        return CheckResult(name=name, status="ok", detail=str(path))
    except Exception as exc:
        return CheckResult(name=name, status="error", detail=f"{exc.__class__.__name__}: {exc}")


def _check_feature_flag_store() -> List[CheckResult]:
    results: List[CheckResult] = []
    path = resolve_config_path()
    try:
        store.load()
        results.append(CheckResult(name="feature-flags:read", status="ok", detail=str(path)))
    except Exception as exc:
        results.append(
            CheckResult(
                name="feature-flags:read",
                status="error",
                detail=f"{exc.__class__.__name__}: {exc}",
            )
        )
        return results

    target = path if path.exists() else path.parent
    try:
        target.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=target, prefix="ready-ff-", suffix=".tmp", delete=True
        ) as handle:
            handle.write(b"ok")
            handle.flush()
        results.append(CheckResult(name="feature-flags:write", status="ok", detail=str(target)))
    except Exception as exc:
        results.append(
            CheckResult(
                name="feature-flags:write",
                status="error",
                detail=f"{exc.__class__.__name__}: {exc}",
            )
        )
    return results


def _check_presign() -> CheckResult:
    backend = os.getenv("STORAGE_BACKEND", "fs").strip().lower() or "fs"
    if backend != "s3":
        return CheckResult(name="storage:presign", status="ok", detail="skipped (fs)")

    try:
        get_presigned_put("readycheck/probe.txt", ttl_days=1)
        return CheckResult(name="storage:presign", status="ok", detail="s3 presign ok")
    except Exception as exc:
        return CheckResult(
            name="storage:presign",
            status="error",
            detail=f"{exc.__class__.__name__}: {exc}",
        )


def readiness_checks() -> Dict[str, Any]:
    checks: List[CheckResult] = []

    checks.append(_check_writable_dir("runs-upload", os.getenv("RUNS_UPLOAD_DIR", "data/uploads")))
    checks.append(_check_writable_dir("runs-dir", os.getenv("GOLFIQ_RUNS_DIR", "data/runs")))
    checks.append(_check_writable_dir("rounds-dir", os.getenv("GOLFIQ_ROUNDS_DIR", "data/rounds")))
    checks.append(_check_writable_dir("bags-dir", os.getenv("GOLFIQ_BAGS_DIR", "data/bags")))
    checks.extend(_check_feature_flag_store())
    checks.append(_check_presign())

    status = "ok" if all(check.status == "ok" for check in checks) else "error"
    return {"status": status, "checks": [check.as_dict() for check in checks]}
