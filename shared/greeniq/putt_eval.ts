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
  signedAngleDeg: number;
  angleClass: 'on' | 'ok' | 'off' | 'unknown';
  paceClass: 'too_soft' | 'good' | 'too_firm' | 'unknown';
  holeDist_m?: number;
  endDist_m?: number;
  lateralMiss_cm?: number;
  aimAdjust_cm?: number;
  angleThresholdsDeg?: { on: number; ok: number };
};

export type StartLineClass = 'open' | 'square' | 'closed';

export type StartLineEval = {
  classification: StartLineClass;
  deltaDeg: number;
};

export type PaceClass = 'too_soft' | 'good' | 'too_firm';

export type PaceEval = {
  classification: PaceClass;
  delta_m: number;
};

const DEFAULT_PACE = { soft: 0.85, firm: 1.2 } as const;
const DEFAULT_ANGLE = { on: 1.0, ok: 2.0 } as const;
const EPSILON = 1e-6;
const ANGLE_TOLERANCE = 1e-6;
const DISTANCE_REFERENCE_M = 3;
const MIN_SCALING_DISTANCE_M = 0.5;

const START_LINE_SQUARE_TOLERANCE_DEG = 0.75;
const PACE_GOOD_TOLERANCE_M = 0.3;

function finiteOrZero(value: number | null | undefined): number {
  return Number.isFinite(value ?? Number.NaN) ? (value as number) : 0;
}

export function evalStartLine(targetDeg: number, strokeDeg: number): StartLineEval {
  const target = finiteOrZero(targetDeg);
  const stroke = finiteOrZero(strokeDeg);
  const delta = stroke - target;
  const magnitude = Math.abs(delta);

  if (magnitude <= START_LINE_SQUARE_TOLERANCE_DEG) {
    return { classification: 'square', deltaDeg: delta };
  }

  return {
    classification: delta > 0 ? 'open' : 'closed',
    deltaDeg: delta,
  };
}

export function evalPace(need_m: number, carry_m: number): PaceEval {
  const need = finiteOrZero(need_m);
  const carry = finiteOrZero(carry_m);
  const delta = carry - need;
  const magnitude = Math.abs(delta);

  if (magnitude <= PACE_GOOD_TOLERANCE_M) {
    return { classification: 'good', delta_m: delta };
  }

  return {
    classification: delta > 0 ? 'too_firm' : 'too_soft',
    delta_m: delta,
  };
}

const RAD_PER_DEG = Math.PI / 180;
const DEG_PER_RAD = 180 / Math.PI;

const BASE_LATERAL_ON_M = Math.tan(DEFAULT_ANGLE.on * RAD_PER_DEG) * DISTANCE_REFERENCE_M;
const BASE_LATERAL_OK_M = Math.tan(DEFAULT_ANGLE.ok * RAD_PER_DEG) * DISTANCE_REFERENCE_M;

function safeAngle(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) {
    return 0;
  }
  if (angleDeg < 0) {
    return 0;
  }
  if (angleDeg > 89.9) {
    return 89.9;
  }
  return angleDeg;
}

function angleToLateral(angleDeg: number, distance: number): number {
  const rad = safeAngle(angleDeg) * RAD_PER_DEG;
  return Math.tan(rad) * distance;
}

function distanceAwareAngles(
  distance: number | undefined,
  baseAngles: { on: number; ok: number },
): { on: number; ok: number } {
  const sanitizedBase = {
    on: safeAngle(baseAngles.on),
    ok: Math.max(safeAngle(baseAngles.ok), safeAngle(baseAngles.on)),
  };

  if (!Number.isFinite(distance) || distance === undefined || distance <= EPSILON) {
    return sanitizedBase;
  }

  const safeDistance = Math.max(distance, MIN_SCALING_DISTANCE_M);
  const baseOnLateral = angleToLateral(sanitizedBase.on, DISTANCE_REFERENCE_M) || BASE_LATERAL_ON_M;
  const baseOkLateral = Math.max(
    angleToLateral(sanitizedBase.ok, DISTANCE_REFERENCE_M),
    angleToLateral(sanitizedBase.on, DISTANCE_REFERENCE_M),
    BASE_LATERAL_OK_M,
  );
  const toAngle = (lateral: number) => {
    if (!Number.isFinite(lateral) || lateral <= 0) {
      return 0;
    }
    const rad = Math.atan2(lateral, safeDistance);
    return Math.max(0, rad * DEG_PER_RAD);
  };

  const on = toAngle(baseOnLateral);
  const ok = Math.max(on + ANGLE_TOLERANCE, toAngle(baseOkLateral));

  if (on <= 0 && ok <= 0) {
    return sanitizedBase;
  }

  return {
    on: on > 0 ? on : sanitizedBase.on,
    ok: ok > 0 ? ok : Math.max(sanitizedBase.ok, sanitizedBase.on + ANGLE_TOLERANCE),
  };
}

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
  const baseAngle = { ...DEFAULT_ANGLE, ...(input.angle ?? {}) };
  const paceBounds = { ...DEFAULT_PACE, ...(input.pace ?? {}) };

  const start = sanitizePoint(input.startPx, input.H);
  const end = sanitizePoint(input.endPx, input.H);
  const hole = sanitizePoint(input.holePx, input.H);

  let angleDeg = 0;
  let signedAngleDeg = 0;
  let angleClass: PuttEval['angleClass'] = 'unknown';
  let paceClass: PuttEval['paceClass'] = 'unknown';
  let holeDist: number | undefined;
  let endDist: number | undefined;
  let lateralMissCm: number | undefined;
  let aimAdjustCm: number | undefined;
  let thresholds = { ...baseAngle };

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
          thresholds = distanceAwareAngles(holeDist, baseAngle);
          const dot = stroke.x * target.x + stroke.y * target.y;
          const denom = strokeLength * targetLength;
          if (Number.isFinite(denom) && denom > EPSILON) {
            const cross = stroke.x * target.y - stroke.y * target.x;
            const angleRad = Math.atan2(cross, dot);
            if (Number.isFinite(angleRad)) {
              signedAngleDeg = angleRad * DEG_PER_RAD;
              if (!Number.isFinite(signedAngleDeg)) {
                signedAngleDeg = 0;
              }
              angleDeg = Math.abs(signedAngleDeg);
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

          if (Number.isFinite(signedAngleDeg) && Number.isFinite(holeDist) && holeDist > EPSILON) {
            const angleRad = signedAngleDeg * RAD_PER_DEG;
            const lateralMeters = Math.tan(angleRad) * holeDist;
            if (Number.isFinite(lateralMeters)) {
              lateralMissCm = lateralMeters * 100;
              aimAdjustCm = -lateralMissCm;
            }
          }
        }
      }
    }
  }

  if (!Number.isFinite(angleDeg) || angleDeg < 0) {
    angleDeg = 0;
  }
  if (!Number.isFinite(signedAngleDeg)) {
    signedAngleDeg = 0;
  }
  if (angleDeg > 180) {
    angleDeg = 180;
  }

  return {
    angleDeg,
    signedAngleDeg,
    angleClass,
    paceClass,
    holeDist_m: Number.isFinite(holeDist ?? Number.NaN) ? holeDist : undefined,
    endDist_m: Number.isFinite(endDist ?? Number.NaN) ? endDist : undefined,
    lateralMiss_cm: Number.isFinite(lateralMissCm ?? Number.NaN) ? lateralMissCm : undefined,
    aimAdjust_cm: Number.isFinite(aimAdjustCm ?? Number.NaN) ? aimAdjustCm : undefined,
    angleThresholdsDeg: thresholds,
  };
}
