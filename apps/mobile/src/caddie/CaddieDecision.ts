import type { DistanceSource } from '@shared/caddie/bagStats';

export type CaddieStrategyType = 'attack' | 'layup';

export type CaddieDecision = {
  holeNumber: number;
  strategy: CaddieStrategyType;
  targetType: 'green' | 'layup';
  targetDistanceM: number | null;
  rawDistanceM: number | null;
  recommendedClubId: string | null;
  recommendedClubDistanceSource?: DistanceSource | null;
  recommendedClubSampleCount?: number | null;
  recommendedClubMinSamples?: number | null;
  explanation: string;
};
