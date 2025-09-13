import zipfile
from io import BytesIO

import numpy as np

from cv_engine.io.framesource import frames_from_zip_bytes


def _zip_of_npy(frames):
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for i, f in enumerate(frames):
            b = BytesIO()
            np.save(b, f, allow_pickle=False)
            z.writestr(f"{i:03d}.npy", b.getvalue())
    return buf.getvalue()


def test_framesource_reads_npy_from_zip():
    frames = [np.zeros((32, 32, 3), dtype=np.uint8) for _ in range(5)]
    zip_bytes = _zip_of_npy(frames)
    out = frames_from_zip_bytes(zip_bytes)
    assert len(out) == 5 and out[0].shape == (32, 32, 3)
