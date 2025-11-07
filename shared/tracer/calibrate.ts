import type { HomographyMatrix } from './types';

export type Pt = { x: number; y: number };

export type WorldPt = { x_m: number; y_m: number };

export type Homography = {
  matrix: HomographyMatrix;
  inverse: HomographyMatrix;
  scale: number;
  rotationRad: number;
  origin: Pt;
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function makeIdentityHomography(): Homography {
  const matrix: HomographyMatrix = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return {
    matrix,
    inverse: matrix,
    scale: 1,
    rotationRad: 0,
    origin: { x: 0, y: 0 },
  };
}

export function estimateScale(teePx: Pt, flagPx: Pt, yardage_m: number): number {
  const dx = safeNumber(flagPx.x) - safeNumber(teePx.x);
  const dy = safeNumber(flagPx.y) - safeNumber(teePx.y);
  const pixelDistance = Math.hypot(dx, dy);
  if (!Number.isFinite(yardage_m) || yardage_m <= 0 || pixelDistance <= 1e-6) {
    return 0;
  }
  return yardage_m / pixelDistance;
}

function buildHomographyMatrix(origin: Pt, scale: number, rotationRad: number): HomographyMatrix {
  const cosTheta = Math.cos(rotationRad);
  const sinTheta = Math.sin(rotationRad);
  const sx = scale * cosTheta;
  const sy = scale * sinTheta;
  const m00 = sx;
  const m01 = -scale * sinTheta;
  const m02 = -(m00 * origin.x + m01 * origin.y);
  const m10 = sy;
  const m11 = scale * cosTheta;
  const m12 = -(m10 * origin.x + m11 * origin.y);
  return [
    [m00, m01, m02],
    [m10, m11, m12],
    [0, 0, 1],
  ];
}

function buildInverseHomography(origin: Pt, scale: number, rotationRad: number): HomographyMatrix {
  if (!Number.isFinite(scale) || scale === 0) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  const cosTheta = Math.cos(rotationRad);
  const sinTheta = Math.sin(rotationRad);
  const invScale = 1 / scale;
  const r00 = cosTheta * invScale;
  const r01 = sinTheta * invScale;
  const r10 = -sinTheta * invScale;
  const r11 = cosTheta * invScale;
  const tx = origin.x;
  const ty = origin.y;
  return [
    [r00, r01, tx],
    [r10, r11, ty],
    [0, 0, 1],
  ];
}

export function computeHomography(
  teePx: Pt,
  flagPx: Pt,
  holeBearingDeg: number,
  yardage_m: number,
): Homography {
  const normalizedYardage = Number.isFinite(yardage_m) ? Math.max(0, yardage_m) : 0;
  const scale = estimateScale(teePx, flagPx, normalizedYardage);
  if (scale <= 0) {
    return makeIdentityHomography();
  }
  const dx = safeNumber(flagPx.x) - safeNumber(teePx.x);
  const dy = safeNumber(flagPx.y) - safeNumber(teePx.y);
  const pixelAngle = Math.atan2(dy, dx);
  const worldAngle = toRad(Number.isFinite(holeBearingDeg) ? holeBearingDeg : 0);
  const rotation = worldAngle - pixelAngle;
  const matrix = buildHomographyMatrix(teePx, scale, rotation);
  const inverse = buildInverseHomography(teePx, scale, rotation);
  return {
    matrix,
    inverse,
    scale,
    rotationRad: rotation,
    origin: { x: teePx.x, y: teePx.y },
  };
}

function apply(matrix: HomographyMatrix, pt: Pt): Pt {
  const x = matrix[0][0] * pt.x + matrix[0][1] * pt.y + matrix[0][2];
  const y = matrix[1][0] * pt.x + matrix[1][1] * pt.y + matrix[1][2];
  const w = matrix[2][0] * pt.x + matrix[2][1] * pt.y + matrix[2][2];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-6) {
    return { x, y };
  }
  return { x: x / w, y: y / w };
}

export function toWorld(px: Pt, homography: Homography): { x_m: number; y_m: number } {
  const projected = apply(homography.matrix, px);
  return { x_m: projected.x, y_m: projected.y };
}

export function toPixels(world: { x_m: number; y_m: number }, homography: Homography): Pt {
  const projected = apply(homography.inverse, { x: world.x_m, y: world.y_m });
  return { x: projected.x, y: projected.y };
}

export function qualityScore(residualsPx: number[]): number {
  if (!Array.isArray(residualsPx) || residualsPx.length === 0) {
    return 0;
  }
  let sumSq = 0;
  let count = 0;
  for (const value of residualsPx) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    sumSq += numeric * numeric;
    count += 1;
  }
  if (count === 0) {
    return 0;
  }
  const rms = Math.sqrt(sumSq / count);
  const SCORE_FALLOFF = 40; // px threshold for poor fit
  const normalized = 1 - Math.min(1, rms / SCORE_FALLOFF);
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0;
}

export function computeResiduals(points: Pt[], homography: Homography): number[] {
  if (!Array.isArray(points)) {
    return [];
  }
  const residuals: number[] = [];
  for (const point of points) {
    if (!point) {
      continue;
    }
    const world = toWorld(point, homography);
    const roundTrip = toPixels(world, homography);
    const residual = Math.hypot(roundTrip.x - point.x, roundTrip.y - point.y);
    residuals.push(residual);
  }
  return residuals;
}
