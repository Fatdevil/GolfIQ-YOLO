from __future__ import annotations

import hashlib
import hmac

import pytest

from server.services import media_signer


def test_signer_is_deterministic(monkeypatch):
    monkeypatch.setattr(media_signer.time, "time", lambda: 1_700_000_000)
    path = "/hls/demo/master.m3u8"
    key = "super-secret"

    first = media_signer.sign(path, key, ttl_s=300)
    second = media_signer.sign(path, key, ttl_s=300)

    assert first == second
    expected_exp = 1_700_000_000 + 300
    assert first["exp"] == expected_exp
    expected_sig = hmac.new(
        key.encode(), f"{path}:{expected_exp}".encode(), hashlib.sha256
    ).hexdigest()
    assert first["sig"] == expected_sig


def test_signer_clamps_ttl(monkeypatch):
    monkeypatch.setattr(media_signer.time, "time", lambda: 100)
    short = media_signer.sign("/hls/demo/master.m3u8", "key", ttl_s=5)
    long = media_signer.sign("/hls/demo/master.m3u8", "key", ttl_s=10_000)

    assert short["exp"] - 100 == 60
    assert long["exp"] - 100 == 3600


def test_signer_rejects_invalid_paths():
    with pytest.raises(AssertionError):
        media_signer.sign("/static/hls/demo.m3u8", "key")


def test_build_url_uses_base():
    payload = {"path": "/hls/demo/master.m3u8", "exp": 123, "sig": "abc"}
    url = media_signer.build_url("https://cdn.example.com", payload)
    assert url == "https://cdn.example.com/hls/demo/master.m3u8?exp=123&sig=abc"
