export type ClubId =
  | 'D'
  | '3W'
  | '5W'
  | '3i'
  | '4i'
  | '5i'
  | '6i'
  | '7i'
  | '8i'
  | '9i'
  | 'PW'
  | 'GW'
  | 'SW'
  | 'LW';

export type BagStat = { p50_m: number; p75_m: number; p90_m: number; samples: number };

export type BagStats = Record<ClubId, BagStat | undefined>;

export type PlaysLike = {
  raw_m: number;
  wind_mps?: number;
  temp_c?: number;
  elevation_m?: number;
  fairwayFirmness?: 'soft' | 'med' | 'firm';
};

export type HazardContext = {
  leftPenaltyProb?: number;
  rightPenaltyProb?: number;
  frontCarryReq_m?: number;
  fairwayWidth_m?: number;
};

export type ScoreContext = {
  par: number;
  strokesToTarget?: number;
  holesRemaining?: number;
};

export type Suggestion = {
  label: 'SAFE' | 'NEUTRAL' | 'AGG';
  club: ClubId;
  carry_m: number;
  rollout_m: number;
  aim: {
    type: 'CENTER' | 'SAFE_LEFT' | 'SAFE_RIGHT';
    lateral_m: number;
    expectedFairwayProb: number;
  };
  expectedSGDelta: number;
  riskPenaltyProb: number;
  rationale: string[];
};

