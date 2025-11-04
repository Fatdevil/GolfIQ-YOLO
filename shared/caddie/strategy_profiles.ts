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
