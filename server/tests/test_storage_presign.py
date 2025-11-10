from __future__ import annotations

import types

import pytest

from server.storage import presign as presign_module


@pytest.fixture(autouse=True)
def _reset_presign_state(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.delenv("CLIPS_BUCKET", raising=False)
    monkeypatch.setattr(presign_module, "_CLIENT", None)


def test_presign_put_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLIPS_BUCKET", "clips-bucket")

    def _fake_generate(bucket: str, key: str, *, Fields, Conditions, ExpiresIn):
        assert bucket == "clips-bucket"
        assert Fields == {"Content-Type": "video/mp4"}
        assert Conditions == [{"Content-Type": "video/mp4"}]
        assert 30 <= ExpiresIn <= 300
        return {
            "url": "https://uploads.example.com",
            "fields": {"key": key, "Content-Type": "video/mp4", "ExpiresIn": ExpiresIn},
        }

    fake_client = types.SimpleNamespace(generate_presigned_post=_fake_generate)
    monkeypatch.setattr(presign_module, "_client", lambda: fake_client)

    url, fields = presign_module.presign_put(
        "clips/event/clip.mp4", content_type="video/mp4", expires=90
    )

    assert url == "https://uploads.example.com"
    assert fields["key"] == "clips/event/clip.mp4"
    assert fields["Content-Type"] == "video/mp4"


def test_presign_put_raises_maps_to_http_500(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLIPS_BUCKET", "clips-bucket")

    def _raise_client():
        raise RuntimeError("boom")

    monkeypatch.setattr(presign_module, "_client", _raise_client)

    with pytest.raises(RuntimeError):
        presign_module.presign_put("clips/event/clip.mp4", content_type="video/mp4")
