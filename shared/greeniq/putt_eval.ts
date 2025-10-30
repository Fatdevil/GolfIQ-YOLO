export type Point2D = { x: number; y: number };

export type PuttEvalInput = {
  startPx: Point2D;
  endPx: Point2D;
  holePx?: Point2D;
  H?: number[][];
  pace: { soft: number; firm: number };
  angle: { on: number; ok: number };
};

export type PuttEval = {
  angleDeg: number;
  angleClass: 'on' | 'ok' | 'off' | 'unknown';
  paceClass: 'too_soft' | 'good' | 'too_firm' | 'unknown';
  holeDist_m?: number;
  endDist_m?: number;
};

const DEFAULT_PACE = { soft: 0.85, firm: 1.2 } as const;
const DEFAULT_ANGLE = { on: 1.0, ok: 2.0 } as const;
const EPSILON = 1e-6;
const ANGLE_TOLERANCE = 1e-6;

function isFinitePoint(point: Partial<Point2D> | undefined | null): point is Point2D {
  if (!point) {
    return false;
  }
  const { x, y } = point;
  return Number.isFinite(x) && Number.isFinite(y);
}

function normalizeMatrix(H?: number[][]): number[] | null {
  if (!H || H.length !== 3) {
    return null;
  }
  const flat: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    const current = H[row];
    if (!Array.isArray(current) || current.length !== 3) {
      return null;
    }
    for (let col = 0; col < 3; col += 1) {
      const value = current[col];
      if (!Number.isFinite(value)) {
        return null;
      }
      flat.push(value);
    }
  }
  return flat;
}

function applyHomographyPoint(point: Point2D, H?: number[][]): Point2D | null {
  const matrix = normalizeMatrix(H);
  if (!matrix) {
    return { x: point.x, y: point.y };
  }
  const [
    h00,
    h01,
    h02,
    h10,
    h11,
    h12,
    h20,
    h21,
    h22,
  ] = matrix;
  const denom = h20 * point.x + h21 * point.y + h22;
  if (!Number.isFinite(denom) || Math.abs(denom) < EPSILON) {
    return null;
  }
  const x = (h00 * point.x + h01 * point.y + h02) / denom;
  const y = (h10 * point.x + h11 * point.y + h12) / denom;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x, y };
}

function subtract(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vectorLength(vec: Point2D): number {
  return Math.hypot(vec.x, vec.y);
}

function clampCosine(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  if (value > 1) {
    return 1;
  }
  if (value < -1) {
    return -1;
  }
  return value;
}

function sanitizePoint(point: Partial<Point2D> | null | undefined, H?: number[][]): Point2D | null {
  if (!isFinitePoint(point)) {
    return null;
  }
  return applyHomographyPoint(point, H);
}

function classifyAngle(angleDeg: number, thresholds: { on: number; ok: number }): 'on' | 'ok' | 'off' {
  const abs = Math.abs(angleDeg);
  if (abs <= thresholds.on + ANGLE_TOLERANCE) {
    return 'on';
  }
  if (abs <= thresholds.ok + ANGLE_TOLERANCE) {
    return 'ok';
  }
  return 'off';
}

function classifyPace(ratio: number, bounds: { soft: number; firm: number }): 'too_soft' | 'good' | 'too_firm' {
  if (ratio < bounds.soft) {
    return 'too_soft';
  }
  if (ratio > bounds.firm) {
    return 'too_firm';
  }
  return 'good';
}

export function evaluatePutt(input: Partial<PuttEvalInput>): PuttEval {
  const thresholds = { ...DEFAULT_ANGLE, ...(input.angle ?? {}) };
  const paceBounds = { ...DEFAULT_PACE, ...(input.pace ?? {}) };

  const start = sanitizePoint(input.startPx, input.H);
  const end = sanitizePoint(input.endPx, input.H);
  const hole = sanitizePoint(input.holePx, input.H);

  let angleDeg = 0;
  let angleClass: PuttEval['angleClass'] = 'unknown';
  let paceClass: PuttEval['paceClass'] = 'unknown';
  let holeDist: number | undefined;
  let endDist: number | undefined;

  if (start && end) {
    const stroke = subtract(end, start);
    const strokeLength = vectorLength(stroke);
    if (Number.isFinite(strokeLength) && strokeLength > EPSILON) {
      endDist = strokeLength;
      if (hole) {
        const target = subtract(hole, start);
        const targetLength = vectorLength(target);
        if (Number.isFinite(targetLength) && targetLength > EPSILON) {
          holeDist = targetLength;
          const dot = stroke.x * target.x + stroke.y * target.y;
          const denom = strokeLength * targetLength;
          if (Number.isFinite(denom) && denom > EPSILON) {
            const cosTheta = clampCosine(dot / denom);
            const angle = Math.acos(cosTheta);
            if (Number.isFinite(angle)) {
              angleDeg = Math.abs((angle * 180) / Math.PI);
              if (!Number.isFinite(angleDeg)) {
                angleDeg = 0;
              } else {
                angleClass = classifyAngle(angleDeg, thresholds);
              }
            }
          }
          const ratio = targetLength > EPSILON ? strokeLength / targetLength : Number.NaN;
          if (Number.isFinite(ratio) && targetLength > EPSILON) {
            paceClass = classifyPace(ratio, paceBounds);
          }
        }
      }
    }
  }

  if (!Number.isFinite(angleDeg) || angleDeg < 0) {
    angleDeg = 0;
  }
  if (angleDeg > 180) {
    angleDeg = 180;
  }

  return {
    angleDeg,
    angleClass,
    paceClass,
    holeDist_m: Number.isFinite(holeDist ?? Number.NaN) ? holeDist : undefined,
    endDist_m: Number.isFinite(endDist ?? Number.NaN) ? endDist : undefined,
  };
}
