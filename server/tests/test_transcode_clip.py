from __future__ import annotations

import uuid

import pytest

from server.jobs import transcode_clip
from server.repositories import clips_repo


def test_transcode_success_local(monkeypatch: pytest.MonkeyPatch) -> None:
    clip_id = uuid.uuid4()
    commands: list[str] = []
    mark_ready_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    mark_failed_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    telemetry: list[tuple[str, dict[str, object]]] = []

    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "local")
    monkeypatch.setenv("CLIPS_CDN_BASE_URL", "https://cdn.test")

    monkeypatch.setattr(
        transcode_clip,
        "_download_to_path",
        lambda src, dest: dest.write_bytes(b"fake"),
    )
    monkeypatch.setattr(
        transcode_clip, "_run_ffmpeg", lambda command: commands.append(command)
    )
    monkeypatch.setattr(transcode_clip, "_probe_duration_ms", lambda _path: 4321)
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
        lambda **payload: telemetry.append(("ready", payload)),
    )
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_failed",
        lambda **payload: telemetry.append(("failed", payload)),
    )

    transcode_clip.handle({"clipId": str(clip_id), "src": "https://cdn/input.mp4"})

    assert len(commands) == 2  # video transcode + thumbnail
    assert not mark_failed_calls
    assert telemetry and telemetry[0][0] == "ready"

    assert mark_ready_calls
    args, kwargs = mark_ready_calls[0]
    assert args[0] == clip_id
    assert kwargs["hls_url"] == f"https://cdn.test/clips/{clip_id}/master.m3u8"
    assert kwargs["thumb_url"].endswith("thumb.jpg")
    assert kwargs["duration_ms"] == 4321


def test_transcode_failure_marks_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    clip_id = uuid.uuid4()
    mark_ready_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    mark_failed_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    telemetry: list[tuple[str, dict[str, object]]] = []

    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "stub")

    def _raise_stub(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(transcode_clip, "_stub_transcode", _raise_stub)
    monkeypatch.setattr(transcode_clip, "emit_clip_ready", lambda **_payload: None)
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_failed",
        lambda **payload: telemetry.append(("failed", payload)),
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

    with pytest.raises(RuntimeError):
        transcode_clip.handle({"clipId": str(clip_id), "src": "https://cdn/input.mp4"})

    assert not mark_ready_calls
    assert mark_failed_calls
    args, kwargs = mark_failed_calls[0]
    assert args[0] == clip_id
    assert "boom" in kwargs.get("error", "")
    assert telemetry and telemetry[0][0] == "failed"
