export type RiskProfile = 'conservative' | 'neutral' | 'aggressive';

export type StrategyWeights = {
  hazardWater: number; // penalty per probability point
  hazardBunker: number;
  hazardRough: number;
  hazardOB: number;
  fairwayBonus: number; // bonus per probability point
  distanceReward: number; // reward per meter toward ideal PL carry
  fatSideBias_m: number; // minimum lateral buffer away from danger
};

export const STRATEGY_DEFAULTS: Record<RiskProfile, StrategyWeights> = {
  conservative: {
    hazardWater: 1.3,
    hazardBunker: 0.7,
    hazardRough: 0.5,
    hazardOB: 2.0,
    fairwayBonus: 0.6,
    distanceReward: 0.08,
    fatSideBias_m: 6,
  },
  neutral: {
    hazardWater: 1.0,
    hazardBunker: 0.5,
    hazardRough: 0.4,
    hazardOB: 1.6,
    fairwayBonus: 0.5,
    distanceReward: 0.1,
    fatSideBias_m: 4,
  },
  aggressive: {
    hazardWater: 0.7,
    hazardBunker: 0.3,
    hazardRough: 0.3,
    hazardOB: 1.2,
    fairwayBonus: 0.6,
    distanceReward: 0.13,
    fatSideBias_m: 2,
  },
};

export type RiskBiasMultipliers = {
  hazard: number;
  distanceReward: number;
  fatSideBiasDelta: number;
};

export const RISK_BIAS_MULTIPLIERS: Record<RiskProfile, RiskBiasMultipliers> = {
  conservative: { hazard: 1.25, distanceReward: 0.9, fatSideBiasDelta: 2 },
  neutral: { hazard: 1, distanceReward: 1, fatSideBiasDelta: 0 },
  aggressive: { hazard: 0.85, distanceReward: 1.1, fatSideBiasDelta: -2 },
};

export type RiskBiasOverride = {
  hazardDelta?: number;
  distanceRewardDelta?: number;
  fatSideBiasDelta?: number;
};

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const clampPositive = (value: number, min: number, max: number): number => {
  if (!(value > 0)) {
    return min;
  }
  return clamp(value, min, max);
};

export const MAX_HAZARD_MULTIPLIER = 2;
export const MIN_HAZARD_MULTIPLIER = 0.5;
export const MAX_DISTANCE_MULTIPLIER = 2;
export const MIN_DISTANCE_MULTIPLIER = 0.5;
export const MIN_FAT_SIDE_DELTA = -6;
export const MAX_FAT_SIDE_DELTA = 6;

export function resolveRiskBiasMultipliers(
  profile: RiskProfile,
  override?: RiskBiasOverride | null,
): RiskBiasMultipliers {
  const base = RISK_BIAS_MULTIPLIERS[profile] ?? RISK_BIAS_MULTIPLIERS.neutral;
  const hazard = clampPositive(
    base.hazard + (override?.hazardDelta ?? 0),
    MIN_HAZARD_MULTIPLIER,
    MAX_HAZARD_MULTIPLIER,
  );
  const distanceReward = clampPositive(
    base.distanceReward + (override?.distanceRewardDelta ?? 0),
    MIN_DISTANCE_MULTIPLIER,
    MAX_DISTANCE_MULTIPLIER,
  );
  const fatSideBiasDelta = clamp(
    base.fatSideBiasDelta + (override?.fatSideBiasDelta ?? 0),
    MIN_FAT_SIDE_DELTA,
    MAX_FAT_SIDE_DELTA,
  );
  return { hazard, distanceReward, fatSideBiasDelta } satisfies RiskBiasMultipliers;
}

export function applyRiskBiasToWeights(
  weights: StrategyWeights,
  riskProfile: RiskProfile,
  override?: RiskBiasOverride | null,
): StrategyWeights {
  const multipliers = resolveRiskBiasMultipliers(riskProfile, override);
  const hazardScale = multipliers.hazard;
  const distanceScale = multipliers.distanceReward;
  const fatSideBias = Math.max(0, weights.fatSideBias_m + multipliers.fatSideBiasDelta);

  return {
    hazardWater: weights.hazardWater * hazardScale,
    hazardBunker: weights.hazardBunker * hazardScale,
    hazardRough: weights.hazardRough * hazardScale,
    hazardOB: weights.hazardOB * hazardScale,
    fairwayBonus: weights.fairwayBonus,
    distanceReward: weights.distanceReward * distanceScale,
    fatSideBias_m: fatSideBias,
  } satisfies StrategyWeights;
}

export function getEffectiveWeights(
  profile: RiskProfile,
  override?: RiskBiasOverride | null,
): StrategyWeights {
  const base = STRATEGY_DEFAULTS[profile] ?? STRATEGY_DEFAULTS.neutral;
  return applyRiskBiasToWeights(base, profile, override);
}
