import type { BagClubStatsMap } from './bagStats';
import { analyzeBagGaps, OVERLAP_MAX } from './bagGapInsights';
import type { PlayerBag } from './playerBag';

export type BagSuggestionType = 'fill_gap' | 'reduce_overlap' | 'calibrate';
export type BagSuggestionSeverity = 'high' | 'medium' | 'low';

export interface BagSuggestion {
  id: string;
  type: BagSuggestionType;
  severity: BagSuggestionSeverity;
  lowerClubId?: string;
  upperClubId?: string;
  gapDistance?: number;
  clubId?: string;
}

export interface BagTuningSuggestions {
  suggestions: BagSuggestion[];
}

const SEVERITY_WEIGHT: Record<BagSuggestionSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const TYPE_WEIGHT: Record<BagSuggestionType, number> = {
  fill_gap: 0,
  reduce_overlap: 1,
  calibrate: 2,
};

function largeGapSeverity(gap: number): BagSuggestionSeverity {
  if (gap >= 30) return 'high';
  if (gap >= 20) return 'medium';
  return 'low';
}

function overlapSeverity(gap: number): BagSuggestionSeverity {
  if (gap <= Math.max(1, OVERLAP_MAX / 3)) return 'high';
  if (gap <= OVERLAP_MAX / 2) return 'medium';
  return 'low';
}

function clubOrderMap(bag: PlayerBag): Record<string, number> {
  return bag.clubs.reduce<Record<string, number>>((acc, club, index) => {
    acc[club.clubId] = index;
    return acc;
  }, {});
}

export function buildBagTuningSuggestions(
  bag: PlayerBag,
  statsByClubId: BagClubStatsMap,
): BagTuningSuggestions {
  const { insights, dataStatusByClubId } = analyzeBagGaps(bag, statsByClubId);
  const order = clubOrderMap(bag);

  const suggestions: BagSuggestion[] = [];

  insights.forEach((insight) => {
    if (insight.type === 'large_gap') {
      suggestions.push({
        id: `fill_gap:${insight.lowerClubId}:${insight.upperClubId}`,
        type: 'fill_gap',
        severity: largeGapSeverity(insight.gapDistance),
        lowerClubId: insight.lowerClubId,
        upperClubId: insight.upperClubId,
        gapDistance: insight.gapDistance,
      });
    } else if (insight.type === 'overlap') {
      suggestions.push({
        id: `reduce_overlap:${insight.lowerClubId}:${insight.upperClubId}`,
        type: 'reduce_overlap',
        severity: overlapSeverity(insight.gapDistance),
        lowerClubId: insight.lowerClubId,
        upperClubId: insight.upperClubId,
        gapDistance: insight.gapDistance,
      });
    }
  });

  Object.entries(dataStatusByClubId).forEach(([clubId, status]) => {
    if (status === 'no_data') {
      suggestions.push({ id: `calibrate:${clubId}`, type: 'calibrate', severity: 'high', clubId });
    } else if (status === 'needs_more_samples') {
      suggestions.push({ id: `calibrate:${clubId}`, type: 'calibrate', severity: 'medium', clubId });
    }
  });

  suggestions.sort((a, b) => {
    const severityDelta = SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (severityDelta !== 0) return severityDelta;

    const typeDelta = TYPE_WEIGHT[a.type] - TYPE_WEIGHT[b.type];
    if (typeDelta !== 0) return typeDelta;

    const aOrder = Math.min(
      a.lowerClubId ? order[a.lowerClubId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      a.upperClubId ? order[a.upperClubId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      a.clubId ? order[a.clubId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
    );
    const bOrder = Math.min(
      b.lowerClubId ? order[b.lowerClubId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      b.upperClubId ? order[b.upperClubId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      b.clubId ? order[b.clubId] ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
    );

    if (aOrder !== bOrder) return aOrder - bOrder;

    return a.id.localeCompare(b.id);
  });

  return { suggestions };
}
