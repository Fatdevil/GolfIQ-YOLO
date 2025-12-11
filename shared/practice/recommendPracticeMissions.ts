import type { PracticeRecommendationsExperimentVariant } from '../experiments/flags';
import type { PracticeDecisionContext, PracticeFocusArea } from './practiceDecisionContext';

export type RecommendedMission = {
  id: string;
  rank: number;
  reason: 'focus_area' | 'goal_progress' | 'fallback';
  algorithmVersion?: 'v1' | 'v2';
  focusArea?: PracticeFocusArea | null;
};

export interface RecommendPracticeMissionsOptions {
  context?: PracticeDecisionContext | null;
  missions: readonly {
    id: string;
    focusArea?: string | null;
    priorityScore?: number | null;
    estimatedMinutes?: number | null;
    difficulty?: number | null;
    completionCount?: number | null;
    lastCompletedAt?: number | string | Date | null;
  }[];
  maxResults?: number;
  experimentVariant?: PracticeRecommendationsExperimentVariant;
}

function normalizeFocusArea(value?: string | null): PracticeFocusArea | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'driving') return 'driving';
  if (normalized === 'approach') return 'approach';
  if (normalized === 'short_game' || normalized === 'short game') return 'short_game';
  if (normalized === 'putting' || normalized === 'putts') return 'putting';
  return null;
}

function rankMissionsV1({
  context,
  missions,
  maxResults,
}: RecommendPracticeMissionsOptions & { context: PracticeDecisionContext }): RecommendedMission[] {
  const limit = maxResults ?? missions.length;
  const focusArea = context.recentFocusAreas?.[0] ?? null;
  const normalizedFocusArea = normalizeFocusArea(focusArea);

  const filtered: RecommendedMission[] = [];

  if (normalizedFocusArea) {
    const reason: RecommendedMission['reason'] = context.goalReached ? 'focus_area' : 'goal_progress';
    missions.forEach((mission) => {
      const missionFocus = normalizeFocusArea(mission.focusArea);
      if (missionFocus === normalizedFocusArea && filtered.length < limit) {
        filtered.push({
          id: mission.id,
          rank: filtered.length + 1,
          reason,
          algorithmVersion: 'v1',
          focusArea: missionFocus,
        });
      }
    });
  }

  if (filtered.length === 0) {
    missions.slice(0, limit).forEach((mission, index) => {
      filtered.push({
        id: mission.id,
        rank: index + 1,
        reason: 'fallback',
        algorithmVersion: 'v1',
        focusArea: normalizeFocusArea(mission.focusArea),
      });
    });
  }

  return filtered.slice(0, limit);
}

function toTimestamp(value?: number | string | Date | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const ts = value.getTime();
    return Number.isFinite(ts) ? ts : null;
  }
  return null;
}

function rankMissionsV2({
  context,
  missions,
  maxResults,
}: RecommendPracticeMissionsOptions & { context: PracticeDecisionContext }): RecommendedMission[] {
  const limit = maxResults ?? missions.length;
  const focusAreas = Array.isArray(context.recentFocusAreas) ? context.recentFocusAreas : [];
  const primaryFocus = focusAreas[0] ?? null;
  const hasFocusSignals = Boolean(primaryFocus);

  if (!hasFocusSignals) {
    return rankMissionsV1({ context, missions, maxResults: limit });
  }

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const goalTarget = context.goalTarget ?? null;
  const goalProgress = context.goalProgress ?? null;
  const goalRemainingRatio =
    goalTarget && goalTarget > 0 && goalProgress != null
      ? Math.max(0, Math.min(1, (goalTarget - goalProgress) / goalTarget))
      : null;

  const scored = missions.map((mission) => {
    const missionFocus = normalizeFocusArea(mission.focusArea);
    const matchesPrimary = missionFocus === primaryFocus;
    const matchesAnyFocus = missionFocus ? focusAreas.includes(missionFocus) : false;
    let score = (mission.priorityScore ?? 0) * 0.5;

    if (matchesPrimary) {
      score += context.goalReached ? 25 : 40;
      if (goalRemainingRatio != null) {
        score += goalRemainingRatio * 15;
      }
      if (context.practiceConfidence < 0.5) {
        score += (0.5 - context.practiceConfidence) * 20;
      }
    } else if (matchesAnyFocus) {
      score += context.goalReached ? 15 : 25;
    } else {
      score += 5;
    }

    if (mission.completionCount != null) {
      score -= Math.min(12, Math.max(0, mission.completionCount) * 2);
    }

    const lastCompletedAt = toTimestamp(mission.lastCompletedAt);
    if (lastCompletedAt != null) {
      const daysSince = (now - lastCompletedAt) / DAY_MS;
      if (daysSince < 2) score -= 12;
      else if (daysSince < 7) score -= 6;
    }

    if (mission.estimatedMinutes != null && mission.estimatedMinutes > 0) {
      score += Math.max(0, 20 - mission.estimatedMinutes);
    }

    if (mission.difficulty != null) {
      score += Math.max(0, 10 - mission.difficulty * 2);
    }

    return {
      mission,
      missionFocus,
      matchesPrimary,
      matchesAnyFocus,
      score,
    };
  });

  const sorted = scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.matchesPrimary !== b.matchesPrimary) return Number(b.matchesPrimary) - Number(a.matchesPrimary);
      if (a.matchesAnyFocus !== b.matchesAnyFocus) return Number(b.matchesAnyFocus) - Number(a.matchesAnyFocus);
      return a.mission.id.localeCompare(b.mission.id);
    })
    .slice(0, limit);

  return sorted.map((entry, index) => {
    const reason: RecommendedMission['reason'] = entry.matchesAnyFocus
      ? context.goalReached
        ? 'focus_area'
        : 'goal_progress'
      : 'fallback';

    return {
      id: entry.mission.id,
      rank: index + 1,
      reason,
      algorithmVersion: 'v2',
      focusArea: entry.missionFocus,
    };
  });
}

export function recommendPracticeMissions({
  context,
  missions,
  maxResults = 3,
  experimentVariant,
}: RecommendPracticeMissionsOptions): RecommendedMission[] {
  if (!context) return [];

  const limit = maxResults ?? missions.length;

  const normalizedVariant: PracticeRecommendationsExperimentVariant =
    experimentVariant === 'treatment'
      ? 'treatment'
      : experimentVariant === 'disabled'
        ? 'disabled'
        : 'control';

  const useV2 = normalizedVariant === 'treatment';

  const ranked = useV2
    ? rankMissionsV2({ context, missions, maxResults: limit, experimentVariant: normalizedVariant })
    : rankMissionsV1({ context, missions, maxResults: limit, experimentVariant: normalizedVariant });

  return ranked.slice(0, limit);
}
