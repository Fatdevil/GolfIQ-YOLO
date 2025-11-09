from __future__ import annotations

from typing import Optional


def qr_svg(data: str, size: int = 192) -> Optional[str]:
    """Return QR SVG markup when ``segno`` is available, otherwise ``None``."""
    if not data:
        raise ValueError("QR payload is required")

    try:
        import io
        import segno  # type: ignore
    except Exception:
        return None

    qr = segno.make(data, micro=False, error="m", version=6, boost_error=False)
    width, _ = qr.symbol_size(scale=1, border=4)
    scale = max(1, int(size / max(width, 1)))
    buffer = io.BytesIO()
    qr.save(buffer, kind="svg", xmldecl=False, unit="px", scale=scale)
    return buffer.getvalue().decode("utf-8")


__all__ = ["qr_svg"]
