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


def qr_svg_placeholder(size: int = 192, label: str = "QR Unavailable") -> str:
    """Tiny inline SVG used when real QR generation is unavailable."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}" role="img" aria-label="qr-unavailable">'
        f'<rect width="100%" height="100%" fill="#111827"/>'
        f'<text x="50%" y="50%" fill="#9CA3AF" font-size="{int(size * 0.12)}" '
        f'dominant-baseline="middle" text-anchor="middle">{label}</text>'
        "</svg>"
    )


__all__ = ["qr_svg", "qr_svg_placeholder"]
