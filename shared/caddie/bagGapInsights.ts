import {
  MIN_AUTOCALIBRATED_SAMPLES,
  shouldUseBagStat,
  type BagClubStats,
  type BagClubStatsMap,
} from './bagStats';
import type { PlayerBag } from './playerBag';

export const LARGE_GAP_MIN = 30;
export const OVERLAP_MAX = 7;

export type BagGapInsightType = 'large_gap' | 'overlap';

export interface BagGapInsight {
  type: BagGapInsightType;
  lowerClubId: string;
  upperClubId: string;
  gapDistance: number;
}

export interface BagGapAnalysis {
  insights: BagGapInsight[];
  dataStatusByClubId: ClubDataStatusById;
}

export type ClubDataStatus = 'auto_calibrated' | 'needs_more_samples' | 'no_data';
export type ClubDataStatusById = Record<string, ClubDataStatus>;

function collectCalibratedClubs(
  bag: PlayerBag,
  statsByClub: BagClubStatsMap,
  minSamples: number,
): { clubId: string; carry: number }[] {
  return bag.clubs
    .map((club) => {
      const stat = statsByClub?.[club.clubId];
      if (!shouldUseBagStat(stat, minSamples)) return null;
      return { clubId: club.clubId, carry: stat.meanDistanceM };
    })
    .filter((entry): entry is { clubId: string; carry: number } => Boolean(entry))
    .sort((a, b) => a.carry - b.carry);
}

export function computeClubDataStatusMap(
  bag: PlayerBag,
  statsByClub: BagClubStatsMap,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): ClubDataStatusById {
  const result: ClubDataStatusById = {};

  bag.clubs.forEach((club) => {
    const stat = (statsByClub as Record<string, BagClubStats | undefined>)[club.clubId];
    const sampleCount = stat?.sampleCount ?? 0;
    if (shouldUseBagStat(stat, minSamples)) {
      result[club.clubId] = 'auto_calibrated';
    } else if (sampleCount > 0) {
      result[club.clubId] = 'needs_more_samples';
    } else {
      result[club.clubId] = 'no_data';
    }
  });

  return result;
}

export function analyzeBagGaps(
  bag: PlayerBag,
  statsByClub: BagClubStatsMap,
  minSamples: number = MIN_AUTOCALIBRATED_SAMPLES,
): BagGapAnalysis {
  const calibrated = collectCalibratedClubs(bag, statsByClub, minSamples);
  const insights: BagGapInsight[] = [];

  for (let i = 0; i < calibrated.length - 1; i += 1) {
    const lower = calibrated[i];
    const upper = calibrated[i + 1];
    const gap = upper.carry - lower.carry;

    if (gap >= LARGE_GAP_MIN) {
      insights.push({
        type: 'large_gap',
        lowerClubId: lower.clubId,
        upperClubId: upper.clubId,
        gapDistance: gap,
      });
    } else if (gap <= OVERLAP_MAX) {
      insights.push({
        type: 'overlap',
        lowerClubId: lower.clubId,
        upperClubId: upper.clubId,
        gapDistance: gap,
      });
    }
  }

  return { insights, dataStatusByClubId: computeClubDataStatusMap(bag, statsByClub, minSamples) };
}
