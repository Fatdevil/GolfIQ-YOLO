import { analyzeBagGaps, type ClubDataStatusById } from './bagGapInsights';
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
  dataStatusByClubId: ClubDataStatusById;
}

export interface BagReadinessRecapInfo {
  score: number; // 0–100
  grade: BagReadinessGrade; // identifier for UI to format (e.g. "excellent")
  summary: string; // identifier for UI/i18n to render a short summary line
  topSuggestionId?: string;
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
  const { dataStatusByClubId } = analyzeBagGaps(bag, statsByClubId);
  const readiness = computeBagReadiness(bag, statsByClubId);
  const { suggestions } = buildBagTuningSuggestions(bag, statsByClubId);

  return {
    readiness,
    suggestions,
    dataStatusByClubId,
  };
}

function summarizeReadiness(readiness: BagReadiness): string {
  if (readiness.noDataCount > 0) return 'missing_data';
  if (readiness.needsMoreSamplesCount > 0) return 'needs_more_samples';
  if (readiness.largeGapCount > 0) return 'gaps_present';
  if (readiness.overlapCount > 0) return 'overlaps_present';
  return 'ready';
}

export function buildBagReadinessRecapInfo(
  bag: PlayerBag | null | undefined,
  stats: BagClubStatsMap | null | undefined,
): BagReadinessRecapInfo | null {
  try {
    if (!bag || !bag.clubs?.length) return null;
    if (!stats) return null;

    const overview = buildBagReadinessOverview(bag, stats);
    const topSuggestionId = overview.suggestions[0]?.id;

    return {
      score: overview.readiness.score,
      grade: overview.readiness.grade,
      summary: summarizeReadiness(overview.readiness),
      topSuggestionId,
    };
  } catch (err) {
    console.warn('[bag] Failed to build recap readiness info', err);
    return null;
  }
}

export type ClubReadinessLevel = 'excellent' | 'ok' | 'poor' | 'unknown';

export function getClubReadiness(
  clubId: string,
  overview: BagReadinessOverview | null | undefined,
): ClubReadinessLevel {
  if (!overview) return 'unknown';
  const status = overview.dataStatusByClubId?.[clubId];

  if (status === 'auto_calibrated') return 'excellent';
  if (status === 'needs_more_samples') return 'ok';
  if (status === 'no_data') return 'poor';

  return 'unknown';
}
