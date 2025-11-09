"""Clip transcode worker handling HLS generation and thumbnails."""

from __future__ import annotations

import logging
import os
import shlex
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict

import httpx

from server.repositories.clips_repo import clips_repo
from server.telemetry.events import emit_clip_failed, emit_clip_ready

logger = logging.getLogger(__name__)

__all__ = ["handle"]


def _download_to_path(src: str, dest: Path) -> None:
    with httpx.stream("GET", src, timeout=60.0) as response:
        response.raise_for_status()
        with dest.open("wb") as fh:
            for chunk in response.iter_bytes():
                if chunk:
                    fh.write(chunk)


def _run_ffmpeg(command: str) -> None:
    logger.debug("running ffmpeg command: %s", command)
    subprocess.run(shlex.split(command), check=True)


def _local_transcode(clip_uuid: uuid.UUID, src: str) -> Dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="clip-transcode-") as tmpdir:
        tmp_path = Path(tmpdir)
        input_path = tmp_path / "input.mp4"
        _download_to_path(src, input_path)
        hls_dir = tmp_path / "hls"
        hls_dir.mkdir(parents=True, exist_ok=True)
        master_playlist = hls_dir / "master.m3u8"
        thumb_path = tmp_path / "thumb.jpg"
        segment_pattern = hls_dir / "v%v_%03d.ts"
        command = (
            f"ffmpeg -y -i {shlex.quote(str(input_path))} "
            '-filter_complex "[0:v]split[v1][v2];'
            "[v1]scale=-2:720[v1o];"
            '[v2]scale=-2:360[v2o]" '
            '-map "[v1o]" -c:v h264 -profile:v main -crf 23 -g 48 -sc_threshold 0 '
            "-f hls -hls_time 4 -hls_playlist_type vod "
            '-var_stream_map "v:0,name:720p v:1,name:360p" '
            f'-map "[v2o]" -c:v h264 -crf 28 -g 48 -hls_time 4 '
            f"-master_pl_name master.m3u8 -hls_segment_filename "
            f"{shlex.quote(str(segment_pattern))} "
            f"{shlex.quote(str(master_playlist))}"
        )
        _run_ffmpeg(command)
        thumb_cmd = (
            f"ffmpeg -y -i {shlex.quote(str(input_path))} -vf "
            "scale=640:-1,select=eq(n\\,0) -vframes 1 "
            f"{shlex.quote(str(thumb_path))}"
        )
        _run_ffmpeg(thumb_cmd)
        duration_ms = _probe_duration_ms(input_path)
        storage_base = os.getenv("CLIPS_CDN_BASE_URL", "https://cdn.local")
        clip_prefix = f"clips/{clip_uuid}"
        hls_url = f"{storage_base}/{clip_prefix}/master.m3u8"
        thumb_url = f"{storage_base}/{clip_prefix}/thumb.jpg"
        mp4_url = f"{storage_base}/{clip_prefix}/source.mp4"
        return {
            "hls_url": hls_url,
            "thumb_url": thumb_url,
            "mp4_url": mp4_url,
            "duration_ms": duration_ms,
        }


def _probe_duration_ms(path: Path) -> int:
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        duration = float(result.stdout.strip())
        return int(duration * 1000)
    except Exception:  # pragma: no cover - best effort
        return 0


def _stub_transcode(clip_uuid: uuid.UUID, src: str) -> Dict[str, Any]:
    base = os.getenv("CLIPS_CDN_BASE_URL", "https://cdn.local")
    clip_prefix = f"clips/{clip_uuid}"
    duration_ms = int(os.getenv("CLIPS_TRANSCODE_STUB_DURATION_MS", "15000") or "15000")
    return {
        "hls_url": f"{base}/{clip_prefix}/master.m3u8",
        "mp4_url": src if src.endswith(".mp4") else None,
        "thumb_url": f"{base}/{clip_prefix}/thumb.jpg",
        "duration_ms": duration_ms,
    }


def handle(job: Dict[str, Any]) -> None:
    clip_id = job.get("clipId")
    src = job.get("src")
    if not clip_id or not src:
        raise ValueError("clipId and src are required")
    clip_uuid = uuid.UUID(str(clip_id))
    provider = os.getenv("CLIPS_TRANSCODE_PROVIDER", "stub").strip().lower()
    try:
        if provider == "local":
            result = _local_transcode(clip_uuid, src)
        else:
            result = _stub_transcode(clip_uuid, src)
        clips_repo.mark_ready(
            clip_uuid,
            hls_url=result["hls_url"],
            mp4_url=result.get("mp4_url"),
            thumb_url=result.get("thumb_url"),
            duration_ms=result.get("duration_ms"),
        )
        emit_clip_ready(
            clipId=str(clip_uuid), duration_ms=result.get("duration_ms") or 0
        )
    except Exception as exc:  # pragma: no cover - re-raised for visibility
        clips_repo.mark_failed(clip_uuid, error=str(exc))
        emit_clip_failed(clipId=str(clip_uuid), error=str(exc))
        logger.exception("clip transcode failed for %s", clip_uuid)
        raise
