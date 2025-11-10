from __future__ import annotations

import importlib
import pkgutil
import warnings

import server


def test_import_all_server_modules() -> None:
    warnings.filterwarnings("ignore", category=Warning)
    modules = list(pkgutil.walk_packages(server.__path__, server.__name__ + "."))
    for module in modules:
        importlib.import_module(module.name)
