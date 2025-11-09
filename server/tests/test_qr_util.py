from __future__ import annotations

import sys
from types import ModuleType

from server.utils.qr_svg import qr_svg


def test_qr_svg_returns_none_when_segno_missing(monkeypatch):
    monkeypatch.setitem(sys.modules, "segno", None)
    monkeypatch.delitem(sys.modules, "segno", raising=False)

    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "segno":
            raise ImportError("segno missing")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    assert qr_svg("golfiq://join/ABCDEF") is None


def test_qr_svg_renders_when_segno_present(monkeypatch):
    module = ModuleType("segno")

    class _DummyQR:
        def __init__(self, data: str):
            self.data = data

        def symbol_size(self, scale=1, border=4):
            return (21, 21)

        def save(self, buf, **kwargs):
            buf.write(f"<svg data='{self.data}' />".encode("utf-8"))

    def _make(data: str, **kwargs):
        return _DummyQR(data)

    module.make = _make  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "segno", module)

    svg = qr_svg("golfiq://join/HIJKLMN")
    assert svg is not None
    assert "golfiq://join/HIJKLMN" in svg
