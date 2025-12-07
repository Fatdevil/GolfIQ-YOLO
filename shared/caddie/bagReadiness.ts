import { analyzeBagGaps } from './bagGapInsights';
import type { BagClubStatsMap } from './bagStats';
import type { PlayerBag } from './playerBag';
import { buildBagTuningSuggestions, type BagSuggestion } from './bagTuningSuggestions';

export type BagReadinessGrade = 'poor' | 'okay' | 'good' | 'excellent';

export interface BagReadiness {
  score: number; // 0–100
  grade: BagReadinessGrade;
  totalClubs: number;
  calibratedClubs: number;
  needsMoreSamplesCount: number;
  noDataCount: number;
  largeGapCount: number;
  overlapCount: number;
}

export interface BagReadinessOverview {
  readiness: BagReadiness;
  suggestions: BagSuggestion[];
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

function scoreToGrade(score: number): BagReadinessGrade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'okay';
  return 'poor';
}

export function computeBagReadiness(
  bag: PlayerBag,
  statsByClubId: BagClubStatsMap,
): BagReadiness {
  const { insights, dataStatusByClubId } = analyzeBagGaps(bag, statsByClubId ?? {});
  const totalClubs = bag.clubs.length;

  let calibratedClubs = 0;
  let needsMoreSamplesCount = 0;
  let noDataCount = 0;

  Object.values(dataStatusByClubId).forEach((status) => {
    if (status === 'auto_calibrated') calibratedClubs += 1;
    else if (status === 'needs_more_samples') needsMoreSamplesCount += 1;
    else if (status === 'no_data') noDataCount += 1;
  });

  const largeGapCount = insights.filter((insight) => insight.type === 'large_gap').length;
  const overlapCount = insights.filter((insight) => insight.type === 'overlap').length;

  let score = 100;

  // Missing data hurts the most: prefer to encourage players to collect shots.
  const noDataPenalty = Math.min(noDataCount * 10, 40);
  const needsMorePenalty = Math.min(needsMoreSamplesCount * 5, 25);

  // Structural issues should nudge the score but not overwhelm data readiness.
  const largeGapPenalty = Math.min(largeGapCount * 7, 35);
  const overlapPenalty = Math.min(overlapCount * 3, 15);

  score -= noDataPenalty + needsMorePenalty + largeGapPenalty + overlapPenalty;

  // If nothing is calibrated yet, gently push the score lower to reflect the unknowns.
  if (calibratedClubs === 0 && totalClubs > 0) {
    score -= 20;
  }

  // When absolutely no clubs have usable data, reflect that the bag is far from ready.
  if (noDataCount === totalClubs && totalClubs > 0) {
    score -= 20;
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    grade: scoreToGrade(finalScore),
    totalClubs,
    calibratedClubs,
    needsMoreSamplesCount,
    noDataCount,
    largeGapCount,
    overlapCount,
  };
}

export function buildBagReadinessOverview(
  bag: PlayerBag,
  statsByClubId: BagClubStatsMap,
): BagReadinessOverview {
  const readiness = computeBagReadiness(bag, statsByClubId);
  const { suggestions } = buildBagTuningSuggestions(bag, statsByClubId);

  return {
    readiness,
    suggestions,
  };
}
