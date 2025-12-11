import type { PracticeDecisionContext, PracticeFocusArea } from './practiceDecisionContext';

export type RecommendedMission = {
  id: string;
  rank: number;
  reason: 'focus_area' | 'goal_progress' | 'fallback';
};

export interface RecommendPracticeMissionsOptions {
  context?: PracticeDecisionContext | null;
  missions: readonly { id: string; focusArea?: string | null }[];
  maxResults?: number;
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

export function recommendPracticeMissions({
  context,
  missions,
  maxResults = 3,
}: RecommendPracticeMissionsOptions): RecommendedMission[] {
  if (!context) return [];

  const focusArea = context.recentFocusAreas?.[0] ?? null;
  const normalizedFocusArea = normalizeFocusArea(focusArea);

  const filtered: RecommendedMission[] = [];

  if (normalizedFocusArea) {
    const reason: RecommendedMission['reason'] = context.goalReached ? 'focus_area' : 'goal_progress';
    missions.forEach((mission) => {
      const missionFocus = normalizeFocusArea(mission.focusArea);
      if (missionFocus === normalizedFocusArea && filtered.length < maxResults) {
        filtered.push({ id: mission.id, rank: filtered.length + 1, reason });
      }
    });
  }

  if (filtered.length === 0) {
    missions.slice(0, maxResults).forEach((mission, index) => {
      filtered.push({ id: mission.id, rank: index + 1, reason: 'fallback' });
    });
  }

  return filtered.slice(0, maxResults);
}
