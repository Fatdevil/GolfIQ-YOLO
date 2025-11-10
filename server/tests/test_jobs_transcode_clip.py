from __future__ import annotations

import subprocess
import types
import uuid
from pathlib import Path

import pytest

from server.jobs import transcode_clip
from server.repositories import clips_repo


def test_handle_success_marks_ready_and_emits(monkeypatch: pytest.MonkeyPatch) -> None:
    clip_id = uuid.uuid4()
    mark_ready_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    mark_failed_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    emitted_ready: list[dict[str, object]] = []
    emitted_failed: list[dict[str, object]] = []

    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "stub")
    monkeypatch.setattr(
        transcode_clip,
        "_stub_transcode",
        lambda clip_uuid, src: {
            "hls_url": f"https://cdn/{clip_uuid}/master.m3u8",
            "mp4_url": src,
            "thumb_url": f"https://cdn/{clip_uuid}/thumb.jpg",
            "duration_ms": 1234,
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
        lambda **payload: emitted_ready.append(dict(payload)),
    )
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_failed",
        lambda **payload: emitted_failed.append(dict(payload)),
    )

    transcode_clip.handle({"clipId": str(clip_id), "src": "https://source/video.mp4"})

    assert mark_ready_calls
    args, kwargs = mark_ready_calls[0]
    assert args[0] == clip_id
    assert kwargs["mp4_url"] == "https://source/video.mp4"
    assert emitted_ready == [{"clipId": str(clip_id), "duration_ms": 1234}]
    assert not mark_failed_calls
    assert not emitted_failed


def test_handle_failure_marks_failed_and_emits(monkeypatch: pytest.MonkeyPatch) -> None:
    clip_id = uuid.uuid4()
    mark_ready_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    mark_failed_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
    emitted_failed: list[dict[str, object]] = []

    monkeypatch.setenv("CLIPS_TRANSCODE_PROVIDER", "local")
    monkeypatch.setattr(
        transcode_clip,
        "_download_to_path",
        lambda _src, dest: dest.write_bytes(b"data"),
    )
    monkeypatch.setattr(transcode_clip, "_probe_duration_ms", lambda _path: 3210)

    def _raise_ffmpeg(*_args, **_kwargs):
        raise subprocess.CalledProcessError(1, "ffmpeg")

    monkeypatch.setattr(transcode_clip, "_run_ffmpeg", _raise_ffmpeg)
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
        lambda **_payload: None,
    )
    monkeypatch.setattr(
        transcode_clip,
        "emit_clip_failed",
        lambda **payload: emitted_failed.append(dict(payload)),
    )

    with pytest.raises(subprocess.CalledProcessError):
        transcode_clip.handle(
            {"clipId": str(clip_id), "src": "https://source/video.mp4"}
        )

    assert not mark_ready_calls
    assert mark_failed_calls
    failed_args, failed_kwargs = mark_failed_calls[0]
    assert failed_args[0] == clip_id
    assert "ffmpeg" in failed_kwargs.get("error", "")
    assert emitted_failed and emitted_failed[0]["clipId"] == str(clip_id)


def test_download_to_path_streams_chunks(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    chunks = [b"a", b"", b"b"]

    class _FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def iter_bytes(self):
            yield from chunks

        def raise_for_status(self) -> None:
            return None

    monkeypatch.setattr(
        transcode_clip.httpx, "stream", lambda method, url, timeout: _FakeStream()
    )

    dest = tmp_path / "out.bin"
    transcode_clip._download_to_path("https://example.com/clip.mp4", dest)

    assert dest.read_bytes() == b"ab"


def test_probe_duration_ms_parses_float(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    fake_result = types.SimpleNamespace(stdout="1.23")
    monkeypatch.setattr(transcode_clip.subprocess, "run", lambda *a, **k: fake_result)

    duration = transcode_clip._probe_duration_ms(tmp_path / "clip.mp4")

    assert duration == 1230
