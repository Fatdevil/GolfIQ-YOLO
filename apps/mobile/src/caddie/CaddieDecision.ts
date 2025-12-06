export type CaddieStrategyType = 'attack' | 'layup';

export type CaddieDecision = {
  holeNumber: number;
  strategy: CaddieStrategyType;
  targetType: 'green' | 'layup';
  targetDistanceM: number | null;
  rawDistanceM: number | null;
  recommendedClubId: string | null;
  explanation: string;
};
