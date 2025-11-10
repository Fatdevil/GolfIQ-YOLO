import uuid

import pytest

from server.jobs import transcode_clip
from server.repositories import clips_repo


def test_handle_success_marks_ready(monkeypatch):
    clip_id = uuid.uuid4()
    mark_ready_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    mark_failed_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    emitted: list[tuple[str, dict[str, object]]] = []

    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "stub")
    monkeypatch.setattr(
        transcode_clip,
        "_stub_transcode",
        lambda clip_uuid, src: {
            "hls_url": f"https://cdn/{clip_uuid}/master.m3u8",
            "mp4_url": src,
            "thumb_url": f"https://cdn/{clip_uuid}/thumb.jpg",
            "duration_ms": 1500,
        },
    )
    monkeypatch.setattr(
        clips_repo,
        "mark_ready",
        lambda *args, **kwargs: mark_ready_calls.append((args, kwargs)) or True,
    )
    monkeypatch.setattr(
        clips_repo,
        "mark_failed",
        lambda *args, **kwargs: mark_failed_calls.append((args, kwargs)) or True,
    )
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_ready",
        lambda **payload: emitted.append(("ready", payload)),
    )
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_failed",
        lambda **payload: emitted.append(("failed", payload)),
    )

    transcode_clip.handle({"clipId": str(clip_id), "src": "https://cdn/src.mp4"})

    assert mark_ready_calls
    args, kwargs = mark_ready_calls[0]
    assert args[0] == clip_id
    assert kwargs["hls_url"].endswith("master.m3u8")
    assert kwargs["mp4_url"] == "https://cdn/src.mp4"
    assert not mark_failed_calls
    assert emitted and emitted[0][0] == "ready"


def test_handle_failure_marks_failed(monkeypatch):
    clip_id = uuid.uuid4()
    mark_failed_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    emitted: list[tuple[str, dict[str, object]]] = []

    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "stub")

    def _raise(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(transcode_clip, "_stub_transcode", _raise)
    monkeypatch.setattr(clips_repo, "mark_ready", lambda *_a, **_k: True)
    monkeypatch.setattr(
        clips_repo,
        "mark_failed",
        lambda *args, **kwargs: mark_failed_calls.append((args, kwargs)) or True,
    )
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_failed",
        lambda **payload: emitted.append(("failed", payload)),
    )
    monkeypatch.setattr(transcode_clip, "emit_clip_ready", lambda **_payload: None)

    with pytest.raises(RuntimeError):
        transcode_clip.handle({"clipId": str(clip_id), "src": "https://cdn/src.mp4"})

    assert mark_failed_calls
    args, kwargs = mark_failed_calls[0]
    assert args[0] == clip_id
    assert "boom" in str(kwargs.get("error", ""))
    assert emitted and emitted[0][0] == "failed"
