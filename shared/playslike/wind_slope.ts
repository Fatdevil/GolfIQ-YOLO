type MaybeNumber = number | null | undefined;

type WindInput = {
  speed_mps: MaybeNumber;
  direction_deg_from: MaybeNumber;
  targetAzimuth_deg?: MaybeNumber;
};

type SlopeInput = {
  deltaHeight_m: MaybeNumber;
};

export interface WindSlopeInput {
  baseDistance_m: number;
  wind?: WindInput | null;
  slope?: SlopeInput | null;
  enable: boolean;
  coeff?: {
    head_per_mps?: number;
    slope_per_m?: number;
    cross_aim_deg_per_mps?: number;
    cap_per_component?: number;
    cap_total?: number;
  };
}

export interface WindSlopeDelta {
  deltaHead_m: number;
  deltaSlope_m: number;
  deltaTotal_m: number;
  aimAdjust_deg?: number;
  notes?: string[];
}

const DEFAULT_HEAD_PER_MPS = 0.015;
const DEFAULT_SLOPE_PER_M = 0.9;
const DEFAULT_CROSS_AIM_DEG_PER_MPS = 0.35;
const DEFAULT_CAP_PER_COMPONENT = 0.15;
const DEFAULT_CAP_TOTAL = 0.25;

const sanitizeDistance = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

const sanitizeCoefficient = (value: MaybeNumber, fallback: number): number => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return value;
};

const sanitizeFraction = (value: MaybeNumber, fallback: number): number => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (!Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return 0;
  }
  return value;
};

const clampAbs = (value: number, limit: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const max = Math.max(0, limit);
  if (max === 0) {
    return 0;
  }
  const magnitude = Math.abs(value);
  if (magnitude <= max) {
    return value;
  }
  return Math.sign(value) * max;
};

const safeNumber = (value: number): number => (Object.is(value, -0) ? 0 : value);

const toRadiansSafe = (degrees: number): number => (degrees * Math.PI) / 180;

const sanitizeWind = (wind: WindInput | null | undefined): {
  speed: number;
  direction: number;
  targetAzimuth: number;
} | null => {
  if (!wind) {
    return null;
  }
  const speed = Number.isFinite(wind.speed_mps) ? Math.max(0, Number(wind.speed_mps)) : 0;
  const direction = Number.isFinite(wind.direction_deg_from)
    ? Number(wind.direction_deg_from)
    : NaN;
  const targetAzimuthRaw = wind.targetAzimuth_deg;
  const targetAzimuth = Number.isFinite(targetAzimuthRaw)
    ? Number(targetAzimuthRaw)
    : 0;
  if (!Number.isFinite(direction)) {
    return null;
  }
  return { speed, direction, targetAzimuth };
};

const sanitizeSlope = (slope: SlopeInput | null | undefined): number | null => {
  if (!slope) {
    return null;
  }
  const delta = slope.deltaHeight_m;
  if (!Number.isFinite(delta)) {
    return null;
  }
  return Number(delta);
};

export function computeWindSlopeDelta(input: WindSlopeInput): WindSlopeDelta {
  const baseDistance = sanitizeDistance(input.baseDistance_m);
  const enabled = Boolean(input.enable) && baseDistance > 0;
  const notes: string[] = [];

  if (!enabled) {
    return { deltaHead_m: 0, deltaSlope_m: 0, deltaTotal_m: 0 };
  }

  const headPerMps = sanitizeCoefficient(input.coeff?.head_per_mps, DEFAULT_HEAD_PER_MPS);
  const slopePerM = sanitizeCoefficient(input.coeff?.slope_per_m, DEFAULT_SLOPE_PER_M);
  const crossAimPerMps = sanitizeCoefficient(
    input.coeff?.cross_aim_deg_per_mps,
    DEFAULT_CROSS_AIM_DEG_PER_MPS,
  );
  const capPerComponentFraction = sanitizeFraction(
    input.coeff?.cap_per_component,
    DEFAULT_CAP_PER_COMPONENT,
  );
  const capTotalFraction = sanitizeFraction(input.coeff?.cap_total, DEFAULT_CAP_TOTAL);

  const capPerComponent = baseDistance * capPerComponentFraction;
  const capTotal = baseDistance * capTotalFraction;

  const wind = sanitizeWind(input.wind ?? null);
  let deltaHead = 0;
  let aimAdjust: number | undefined;
  if (wind && wind.speed > 0 && headPerMps !== 0) {
    const thetaDeg = wind.direction - wind.targetAzimuth;
    const thetaRad = toRadiansSafe(thetaDeg % 360);
    const headComponent = wind.speed * Math.cos(thetaRad);
    const crossComponent = wind.speed * Math.sin(thetaRad);
    const rawHead = -baseDistance * headPerMps * headComponent;
    const cappedHead = clampAbs(rawHead, capPerComponent);
    if (cappedHead !== rawHead) {
      notes.push("head_component_capped");
    }
    deltaHead = cappedHead;
    const rawAim = crossAimPerMps * crossComponent;
    if (Number.isFinite(rawAim) && rawAim !== 0) {
      aimAdjust = rawAim;
    }
  }

  const slopeDelta = sanitizeSlope(input.slope ?? null);
  let deltaSlope = 0;
  if (slopeDelta !== null && slopePerM !== 0) {
    const rawSlope = -slopePerM * slopeDelta;
    const cappedSlope = clampAbs(rawSlope, capPerComponent);
    if (cappedSlope !== rawSlope) {
      notes.push("slope_component_capped");
    }
    deltaSlope = cappedSlope;
  }

  let deltaTotal = deltaHead + deltaSlope;

  if (capTotal === 0) {
    if (deltaHead !== 0 || deltaSlope !== 0) {
      notes.push("total_capped");
    }
    deltaHead = 0;
    deltaSlope = 0;
    deltaTotal = 0;
  } else if (Math.abs(deltaTotal) > capTotal) {
    const scale = capTotal / Math.max(Math.abs(deltaTotal), Number.EPSILON);
    deltaHead *= scale;
    deltaSlope *= scale;
    deltaTotal = deltaHead + deltaSlope;
    notes.push("total_capped");
  }

  const result: WindSlopeDelta = {
    deltaHead_m: safeNumber(deltaHead),
    deltaSlope_m: safeNumber(deltaSlope),
    deltaTotal_m: safeNumber(deltaTotal),
  };

  if (aimAdjust !== undefined && Number.isFinite(aimAdjust)) {
    result.aimAdjust_deg = safeNumber(aimAdjust);
  }

  if (notes.length > 0) {
    result.notes = Array.from(new Set(notes));
  }

  return result;
}
