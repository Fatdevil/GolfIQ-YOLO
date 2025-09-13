import numpy as np


def to_uint8_rgb(arr: "np.ndarray") -> "np.ndarray":
    """Normalisera till (H,W,3) uint8."""
    import numpy as np

    x = np.asarray(arr)
    if x.ndim == 2:  # grå → RGB
        x = np.stack([x, x, x], axis=-1)
    if x.ndim == 3 and x.shape[-1] == 4:  # RGBA → RGB
        x = x[..., :3]
    if x.dtype != np.uint8:
        x = np.clip(x, 0, 255).astype(np.uint8)
    return x
