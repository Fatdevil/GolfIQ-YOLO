from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence, Tuple

import numpy as np

Point = Tuple[float, float]


@dataclass
class HomographyResult:
    matrix: np.ndarray
    rms: float
    correspondences: int

    def project(self, pt: Point) -> Point:
        return project_point(self.matrix, pt)


def _normalize(points: Sequence[Point]) -> tuple[np.ndarray, np.ndarray]:
    pts = np.asarray(points, dtype=float)
    centroid = pts.mean(axis=0)
    shifted = pts - centroid
    mean_dist = np.sqrt((shifted**2).sum(axis=1)).mean()
    scale = np.sqrt(2) / mean_dist if mean_dist else 1.0
    T = np.array(
        [[scale, 0, -scale * centroid[0]], [0, scale, -scale * centroid[1]], [0, 0, 1]],
        dtype=float,
    )
    pts_h = np.c_[shifted * scale, np.ones(len(points))]
    return T, pts_h


def estimate_homography(
    src: Sequence[Point], dst: Sequence[Point]
) -> HomographyResult:
    """Estimate homography from >=2 point pairs using DLT with normalization."""

    if len(src) != len(dst):
        raise ValueError("Source/destination point count mismatch")
    if len(src) < 2:
        raise ValueError("Need at least two correspondences")

    src_T, src_norm = _normalize(src)
    dst_T, dst_norm = _normalize(dst)

    A = []
    for (x, y, _), (u, v, _) in zip(src_norm, dst_norm):
        A.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
    A = np.asarray(A, dtype=float)
    _, _, Vt = np.linalg.svd(A)
    H = Vt[-1].reshape(3, 3)
    H = np.linalg.inv(dst_T) @ H @ src_T
    H /= H[2, 2]

    rms = 0.0
    if len(src) >= 2:
        pts_proj = project_points(H, src)
        diffs = np.asarray(dst) - np.asarray(pts_proj)
        rms = float(np.sqrt((diffs**2).sum(axis=1).mean()))

    return HomographyResult(matrix=H, rms=rms, correspondences=len(src))


def project_point(H: np.ndarray, pt: Point) -> Point:
    vec = np.array([pt[0], pt[1], 1.0], dtype=float)
    res = H @ vec
    if res[2] == 0:
        return (float("nan"), float("nan"))
    return (float(res[0] / res[2]), float(res[1] / res[2]))


def project_points(H: np.ndarray, pts: Iterable[Point]) -> list[Point]:
    return [project_point(H, pt) for pt in pts]


def ground_homography_from_scale(m_per_px: float) -> np.ndarray:
    """Fallback homography assuming orthographic scaling."""

    return np.array([[m_per_px, 0, 0], [0, m_per_px, 0], [0, 0, 1]], dtype=float)


def to_ground_plane(track_px: Sequence[Point], H: np.ndarray) -> list[Point]:
    """Project pixel track to ground plane coordinates in meters."""

    return project_points(H, track_px)
