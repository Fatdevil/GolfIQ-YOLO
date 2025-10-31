export type StimpCalibration = {
  rollout_m: number;
};

export type StimpEstimate = {
  stimpFt: number;
  paceFactor: number;
  samplesUsed: number;
  medianRollout_m: number;
};

const FT_PER_M = 3.28084;
const DEFAULT_STIMP = 10;
const MIN_VALID_ROLLOUT_M = 0.5;
const MAX_VALID_ROLLOUT_M = 20;
const PACE_FACTOR_MIN = 0.5;
const PACE_FACTOR_MAX = 1.5;

const median = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
};

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const sanitizeRollouts = (calibrations: readonly StimpCalibration[]): number[] =>
  calibrations
    .map((entry) => Number(entry.rollout_m))
    .filter((value) => Number.isFinite(value) && value >= MIN_VALID_ROLLOUT_M && value <= MAX_VALID_ROLLOUT_M);

export const estimateStimp = (
  calibrations: readonly StimpCalibration[],
  options?: { baselineStimp?: number },
): StimpEstimate => {
  const baseline = Number.isFinite(options?.baselineStimp)
    ? Number(options?.baselineStimp)
    : DEFAULT_STIMP;
  const validRollouts = sanitizeRollouts(calibrations);
  if (!validRollouts.length) {
    return {
      stimpFt: baseline,
      paceFactor: 1,
      samplesUsed: 0,
      medianRollout_m: 0,
    };
  }

  const trimmed = validRollouts.length > 2 ? validRollouts.slice(1, validRollouts.length - 1) : validRollouts;
  const central = median(trimmed);
  const stimpFt = central * FT_PER_M;
  const pace = central > 0 ? clamp(baseline / stimpFt, PACE_FACTOR_MIN, PACE_FACTOR_MAX) : 1;

  return {
    stimpFt,
    paceFactor: pace,
    samplesUsed: trimmed.length,
    medianRollout_m: central,
  };
};

const sanitizePositive = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const numeric = Number(value);
  return numeric > 0 ? numeric : fallback;
};

export const stimpFactor = (stimp?: number, baseline: number = DEFAULT_STIMP): number => {
  const safeBaseline = sanitizePositive(baseline, DEFAULT_STIMP);
  const safeStimp = sanitizePositive(stimp, safeBaseline);
  if (safeStimp <= 0) {
    return 1;
  }
  return safeBaseline / safeStimp;
};
