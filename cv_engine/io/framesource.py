from __future__ import annotations

import zipfile
from io import BytesIO
from typing import List

import numpy as np

from ..utils.img import to_uint8_rgb

_IMAGE_EXTS = (".png", ".jpg", ".jpeg")
_NPY_EXT = ".npy"


def frames_from_zip_bytes(buf: bytes) -> List["np.ndarray"]:
    """
    Läs frames från en ZIP. Stöd:
      - PNG/JPG (om imageio finns; annars ignoreras bildfiler)
      - .npy (alltid, rekommenderat i tester)
    Returnerar en lista av (H,W,3) uint8.
    """
    zs = zipfile.ZipFile(BytesIO(buf))
    names = sorted([n for n in zs.namelist() if not n.endswith("/")])
    frames: List["np.ndarray"] = []
    reader = None
    try:
        import imageio.v2 as iio  # valfritt

        reader = iio
    except Exception:
        reader = None

    for n in names:
        low = n.lower()
        with zs.open(n) as fh:
            data = fh.read()
        if low.endswith(_NPY_EXT):
            arr = np.load(BytesIO(data), allow_pickle=False)
            frames.append(to_uint8_rgb(arr))
        elif low.endswith(_IMAGE_EXTS) and reader is not None:
            arr = reader.imread(BytesIO(data))
            frames.append(to_uint8_rgb(arr))
        else:
            # okänd filtyp eller saknar imageio → hoppa över
            continue
    return frames
