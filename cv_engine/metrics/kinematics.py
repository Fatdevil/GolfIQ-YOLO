from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CalibrationParams:
    """Simple calibration data for kinematics computations."""

    m_per_px: float
    fps: float

    @classmethod
    def from_reference(
        cls, ref_len_m: float, ref_len_px: float, fps: float
    ) -> "CalibrationParams":
        return cls(m_per_px=ref_len_m / ref_len_px, fps=fps)
