from __future__ import annotations

import os
import tempfile
from typing import List, Union

import numpy as np


def frames_from_video(
    src: Union[str, bytes], max_frames: int | None = None, stride: int = 1
) -> List["np.ndarray"]:
    """
    Läs frames från video (MP4 m.fl.) till list[(H,W,3) uint8 RGB].
    - src: filväg eller bytes (vid bytes skrivs tempfil)
    - max_frames: max antal frames att returnera
    - stride: hoppa var 'stride':e frame (1 = alla)
    Kräver extras [video] (cv2). Om cv2 saknas: raise ImportError.
    """
    import numpy as np

    try:
        import cv2  # type: ignore
    except Exception as e:
        raise ImportError(
            "Video extras not installed. Use pip install -e '.[video]'"
        ) from e

    cleanup = None
    path = src
    if isinstance(src, (bytes, bytearray)):
        fd, tmp = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        with open(tmp, "wb") as f:
            f.write(src)
        path = tmp
        cleanup = tmp

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        if cleanup:
            os.remove(cleanup)
        raise RuntimeError(f"Unable to open video: {path}")

    frames: List["np.ndarray"] = []
    idx = 0
    keep = True
    while keep:
        ok, frame_bgr = cap.read()
        if not ok:
            break
        if idx % max(1, stride) == 0:
            frame_rgb = frame_bgr[:, :, ::-1]
            if frame_rgb.dtype != np.uint8:
                frame_rgb = frame_rgb.astype(np.uint8)
            frames.append(frame_rgb)
            if max_frames is not None and len(frames) >= max_frames:
                break
        idx += 1

    cap.release()
    if cleanup:
        os.remove(cleanup)
    return frames


def fps_from_video(src: Union[str, bytes]) -> float:
    """Försök läsa FPS från video. Returnerar >0 vid framgång, annars 0."""
    try:
        import cv2  # type: ignore
    except Exception:
        return 0.0
    import os
    import tempfile

    cleanup = None
    path = src
    if isinstance(src, (bytes, bytearray)):
        fd, tmp = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        with open(tmp, "wb") as f:
            f.write(src)
        path = tmp
        cleanup = tmp
    cap = cv2.VideoCapture(str(path))
    fps = float(cap.get(5))  # CAP_PROP_FPS
    cap.release()
    if cleanup:
        os.remove(cleanup)
    return fps if fps and fps > 0 else 0.0
