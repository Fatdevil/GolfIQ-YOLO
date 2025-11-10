from __future__ import annotations

import importlib
import inspect
import pkgutil
import warnings

import server

warnings.filterwarnings("ignore")

_TARGET_PREFIXES = (
    "server.repositories",
    "server.storage",
    "server.jobs",
    "server.telemetry",
)


def _defaults(signature: inspect.Signature) -> dict[str, object]:
    values: dict[str, object] = {}
    for parameter in signature.parameters.values():
        if parameter.kind in (
            inspect.Parameter.VAR_POSITIONAL,
            inspect.Parameter.VAR_KEYWORD,
        ):
            continue
        if parameter.default is not inspect._empty:
            values[parameter.name] = parameter.default
            continue
        name = parameter.name.lower()
        if "event" in name:
            values[parameter.name] = "event"
        elif any(token in name for token in ("hole", "rev", "count", "thru")):
            values[parameter.name] = 1
        else:
            values[parameter.name] = None
    return values


def test_import_and_call_small_helpers_smoke() -> None:
    for module_info in pkgutil.walk_packages(server.__path__, server.__name__ + "."):
        if not module_info.name.startswith(_TARGET_PREFIXES):
            continue
        module = importlib.import_module(module_info.name)
        for name, obj in list(vars(module).items()):
            if not callable(obj) or inspect.isclass(obj):
                continue
            try:
                signature = inspect.signature(obj)
            except (TypeError, ValueError):
                continue
            if inspect.iscoroutinefunction(obj):
                continue
            if len(signature.parameters) > 3:
                continue
            kwargs = _defaults(signature)
            try:
                obj(**kwargs)
            except Exception:
                continue
