export type BagClubStats = {
  clubId: string;
  sampleCount: number;
  meanDistanceM: number;
  p20DistanceM?: number | null;
  p80DistanceM?: number | null;
};

export type BagClubStatsMap = Record<string, BagClubStats | undefined>;

export type DistanceSource =
  | 'auto_calibrated' // from bag stats, meets min sample threshold
  | 'partial_stats' // stats exist but below threshold; still using bag/default carry
  | 'manual' // from user-configured carry override
  | 'default'; // from built-in defaults (no bag data)

export const MIN_AUTOCALIBRATED_SAMPLES = 5;

export function shouldUseBagStat(
  stat: BagClubStats | undefined,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): stat is BagClubStats {
  return Boolean(stat && Number.isFinite(stat.meanDistanceM) && (stat.sampleCount ?? 0) >= minSamples);
}
