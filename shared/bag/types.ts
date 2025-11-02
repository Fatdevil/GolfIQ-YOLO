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
  | 'LW'
  | 'Putter'
  | (string & {});

export interface ClubStats {
  club: ClubId;
  samples: number;
  meanCarry_m: number | null;
  p25_m: number | null;
  p50_m: number | null;
  p75_m: number | null;
  std_m: number | null;
  sgPerShot: number | null;
}

export interface BagStats {
  updatedAt: number;
  clubs: Record<ClubId, ClubStats>;
}

export interface ClubUsageBreakdown {
  tee: number;
  approach: number;
  other: number;
  outliers: number;
}

export type ClubSamples = {
  club: ClubId;
  carries: number[];
  trimmedCarries: number[];
  sgValues: number[];
  usage: ClubUsageBreakdown;
};

export interface BagDerivation {
  stats: BagStats;
  samples: Record<ClubId, ClubSamples>;
}
