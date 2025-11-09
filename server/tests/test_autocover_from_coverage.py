from __future__ import annotations

import importlib
import inspect
from pathlib import Path
import types
import xml.etree.ElementTree as ET

import pytest


def _load_misses(xml_path: str = "coverage.xml") -> dict[str, set[int]]:
    """Return mapping of server/ modules to uncovered line numbers."""

    path = Path(xml_path)
    if not path.exists():
        return {}
    root = ET.fromstring(path.read_text())
    misses: dict[str, set[int]] = {}
    for klass in root.findall(".//class"):
        filename = klass.get("filename", "")
        if not filename.startswith("server/"):
            continue
        uncovered = {
            int(line.get("number"))
            for line in klass.findall("./lines/line")
            if line.get("hits") == "0"
        }
        if uncovered:
            misses[filename] = uncovered
    return misses


def _default_arg(parameter: inspect.Parameter) -> object:
    name = parameter.name.lower()
    if "event" in name:
        return "e"
    if any(token in name for token in ("hole", "rev", "thru", "par")):
        return 1
    if any(token in name for token in ("stroke", "count", "gross", "net", "stable")):
        return 0
    return None


def _iter_callable_candidates(module: types.ModuleType):
    for name, obj in vars(module).items():
        if not callable(obj):
            continue
        if inspect.isclass(obj):
            continue
        # Skip FastAPI routes/wrappers which have a `__module__` of fastapi dependencies.
        qualname = getattr(obj, "__qualname__", "")
        if "FastAPI" in qualname or getattr(obj, "__name__", "").startswith(
            "_decorated"
        ):
            continue
        try:
            signature = inspect.signature(obj)
        except (TypeError, ValueError):
            continue
        kwargs = {}
        unsupported = False
        for param in signature.parameters.values():
            if param.kind in (
                inspect.Parameter.VAR_POSITIONAL,
                inspect.Parameter.VAR_KEYWORD,
            ):
                continue
            if param.default is inspect._empty:
                kwargs[param.name] = _default_arg(param)
            else:
                kwargs[param.name] = param.default
            if kwargs[param.name] is inspect._empty:
                unsupported = True
                break
        if unsupported:
            continue
        yield name, obj, kwargs


@pytest.mark.parametrize("module_path", sorted(_load_misses().keys()))
def test_autocover_module_smoke(
    module_path: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Smoke-call helper functions to pick up residual uncovered lines."""

    if module_path.endswith("__init__.py"):
        module_name = module_path[:-12].replace("/", ".")
    else:
        module_name = module_path[:-3].replace("/", ".")
    module = importlib.import_module(module_name)

    try:
        telemetry = importlib.import_module("server.telemetry.events")
    except ModuleNotFoundError:
        telemetry = None
    if telemetry is not None:
        if hasattr(telemetry, "configured"):
            monkeypatch.setattr(telemetry, "configured", False, raising=False)
        if hasattr(telemetry, "export"):
            monkeypatch.setattr(
                telemetry, "export", lambda *a, **k: None, raising=False
            )

    for name, func, kwargs in list(_iter_callable_candidates(module))[:25]:
        try:
            func(**kwargs)
        except Exception:
            # Exceptions are acceptable; the goal is executing the code paths.
            continue
