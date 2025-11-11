from __future__ import annotations

from server.services import media_signer


def test_b64_encodes_hex_string() -> None:
    encoded = media_signer._b64(b"\x00\xff")
    assert encoded == "00ff"
