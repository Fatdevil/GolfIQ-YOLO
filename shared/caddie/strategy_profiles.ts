export type RiskProfile = 'conservative' | 'neutral' | 'aggressive';

export type StrategyWeights = {
  hazardWater: number;
  hazardBunker: number;
  hazardRough: number;
  hazardOB: number;
  fairwayBonus: number;
  distanceReward: number;
  fatSideBias_m: number;
};

const makeWeights = (weights: StrategyWeights): StrategyWeights => ({ ...weights });

export const STRATEGY_DEFAULTS: Record<RiskProfile, StrategyWeights> = {
  conservative: makeWeights({
    hazardWater: 1.6,
    hazardBunker: 0.8,
    hazardRough: 0.6,
    hazardOB: 2.2,
    fairwayBonus: 0.45,
    distanceReward: 0.0008,
    fatSideBias_m: 8,
  }),
  neutral: makeWeights({
    hazardWater: 1.2,
    hazardBunker: 0.6,
    hazardRough: 0.45,
    hazardOB: 1.6,
    fairwayBonus: 0.35,
    distanceReward: 0.001,
    fatSideBias_m: 5,
  }),
  aggressive: makeWeights({
    hazardWater: 0.85,
    hazardBunker: 0.4,
    hazardRough: 0.3,
    hazardOB: 1.1,
    fairwayBonus: 0.25,
    distanceReward: 0.0015,
    fatSideBias_m: 3,
  }),
};
