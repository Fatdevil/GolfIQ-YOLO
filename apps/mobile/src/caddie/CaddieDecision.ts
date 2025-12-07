import type { DistanceSource } from '@shared/caddie/bagStats';
import type { ClubReadinessLevel } from '@shared/caddie/bagReadiness';

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
  recommendedClubReadiness?: ClubReadinessLevel;
  explanation: string;
};
