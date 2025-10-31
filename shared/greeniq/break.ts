import { stimpFactor } from './stimp';

export type BreakHintInput = {
  length_m: number;
  angleDeg: number;
  paceRatio: number;
  slope_pct?: number;
  stimp?: number;
  coeff?: {
    aim_cm_per_deg_per_m?: number;
    aim_cm_per_pct_per_m2?: number;
    tempo_soft_thresh?: number;
    tempo_firm_thresh?: number;
    max_aim_cm?: number;
  };
};

export type BreakHint = {
  aimSide: 'left' | 'right' | 'center' | 'unknown';
  aimCm: number | null;
  tempoHint: 'softer' | 'firmer' | 'good';
  confidence: 'low' | 'med' | 'high';
};

const DEFAULT_COEFF = {
  aim_cm_per_deg_per_m: 1.2,
  aim_cm_per_pct_per_m2: 0.35,
  tempo_soft_thresh: 0.85,
  tempo_firm_thresh: 1.2,
  max_aim_cm: 60,
} as const;

const ANGLE_CENTER_EPS = 0.05;

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const sanitizeNumber = (value: number | undefined, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(value);
};

const sanitizePositive = (value: number | undefined, fallback: number): number => {
  const numeric = sanitizeNumber(value, fallback);
  return numeric > 0 ? numeric : fallback;
};

const resolveCoeff = (input?: BreakHintInput['coeff']) => ({
  aim_cm_per_deg_per_m: sanitizePositive(input?.aim_cm_per_deg_per_m, DEFAULT_COEFF.aim_cm_per_deg_per_m),
  aim_cm_per_pct_per_m2: sanitizePositive(input?.aim_cm_per_pct_per_m2, DEFAULT_COEFF.aim_cm_per_pct_per_m2),
  tempo_soft_thresh: sanitizePositive(input?.tempo_soft_thresh, DEFAULT_COEFF.tempo_soft_thresh),
  tempo_firm_thresh: sanitizePositive(input?.tempo_firm_thresh, DEFAULT_COEFF.tempo_firm_thresh),
  max_aim_cm: sanitizePositive(input?.max_aim_cm, DEFAULT_COEFF.max_aim_cm),
});

const tempoHintFromRatio = (
  ratio: number,
  soft: number,
  firm: number,
): BreakHint['tempoHint'] => {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 'good';
  }
  if (ratio < soft) {
    return 'firmer';
  }
  if (ratio > firm) {
    return 'softer';
  }
  return 'good';
};

export function breakHint(input: BreakHintInput): BreakHint {
  const coeff = resolveCoeff(input.coeff);

  const length = Number(input.length_m);
  const angle = Number(input.angleDeg);
  const pace = Number(input.paceRatio);
  const slopeRaw = input.slope_pct;

  const lengthValid = Number.isFinite(length) && length > 0;
  const angleFinite = Number.isFinite(angle);
  const slopeFinite = Number.isFinite(slopeRaw);

  let aimSide: BreakHint['aimSide'] = 'unknown';
  if (lengthValid && angleFinite) {
    const absAngle = Math.abs(angle);
    if (absAngle <= ANGLE_CENTER_EPS) {
      aimSide = 'center';
    } else {
      aimSide = angle > 0 ? 'right' : 'left';
    }
  }

  let aimCm: number | null = null;
  if (lengthValid && angleFinite) {
    const absAngle = Math.abs(angle);
    const base = absAngle * length * coeff.aim_cm_per_deg_per_m;
    const slopeMag = slopeFinite ? Math.abs(Number(slopeRaw)) : null;
    const slopeTerm = slopeMag !== null ? slopeMag * length * length * coeff.aim_cm_per_pct_per_m2 : 0;
    const combined = aimSide === 'center' ? 0 : clamp(base + slopeTerm, 0, coeff.max_aim_cm);
    const adjusted = combined * stimpFactor(input.stimp);
    aimCm = Number.isFinite(adjusted) ? adjusted : null;
  }

  const tempo = tempoHintFromRatio(pace, coeff.tempo_soft_thresh, coeff.tempo_firm_thresh);

  let confidence: BreakHint['confidence'] = 'low';
  if (lengthValid && angleFinite && slopeFinite) {
    if (length >= 3) {
      confidence = 'high';
    } else if (length >= 1.5) {
      confidence = 'med';
    } else {
      confidence = 'low';
    }
  }

  return {
    aimSide,
    aimCm,
    tempoHint: tempo,
    confidence,
  };
}
