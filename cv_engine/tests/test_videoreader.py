import os
import tempfile

import numpy as np
import pytest

cv2 = pytest.importorskip("cv2")


def _tmp_mp4_path(frames=10, w=64, h=64):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    fd, path = tempfile.mkstemp(suffix=".mp4")
    os.close(fd)
    writer = cv2.VideoWriter(path, fourcc, 30.0, (w, h))
    for i in range(frames):
        img = np.zeros((h, w, 3), dtype=np.uint8)
        img[:] = (i % 255, 0, 0)
        writer.write(img[:, :, ::-1])  # RGB->BGR
    writer.release()
    return path


def test_frames_from_video_reads_frames():
    from cv_engine.io.videoreader import fps_from_video, frames_from_video

    path = _tmp_mp4_path(frames=12)
    try:
        out = frames_from_video(path, max_frames=10)
        assert len(out) == 10 and out[0].shape[2] == 3
        fps = fps_from_video(path)
        assert fps > 0
    finally:
        os.remove(path)
