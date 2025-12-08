import {
  DEFAULT_HISTORY_WINDOW_DAYS,
  computeMissionStreak,
  selectRecentMissions,
  type PracticeMissionHistoryEntry,
} from '@shared/practice/practiceHistory';

import type { BagReadinessOverview } from './bagReadiness';
import type { BagSuggestion } from './bagTuningSuggestions';

export interface BagPracticeRecommendation {
  id: string;
  titleKey: string;
  descriptionKey: string;
  targetClubs: string[];
  targetSampleCount?: number;
  sourceSuggestionId: string;
  status: 'new' | 'due' | 'fresh';
  priorityScore: number;
  lastCompletedAt: Date | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type MissionCoverageByClub = Record<
  string,
  {
    completed: number;
    lastCompletedAt: number | null;
  }
>;

export function buildMissionCoverageByClub(
  history: PracticeMissionHistoryEntry[],
  options: { windowDays?: number; now?: Date } = {},
): MissionCoverageByClub {
  const { windowDays = DEFAULT_HISTORY_WINDOW_DAYS, now = new Date() } = options;
  if (!Array.isArray(history) || history.length === 0) return {};

  const coverage: MissionCoverageByClub = {};
  const recent = selectRecentMissions(history, { daysBack: windowDays }, now);

  for (const entry of recent) {
    if (entry.status !== 'completed') continue;
    if (!Array.isArray(entry.targetClubs) || entry.targetClubs.length === 0) continue;

    const completedAt = entry.endedAt ?? entry.startedAt;
    const ts = completedAt ? new Date(completedAt).getTime() : Number.NaN;
    const safeTs = Number.isFinite(ts) ? ts : 0; // Treat corrupt timestamps as very old

    for (const club of entry.targetClubs) {
      if (typeof club !== 'string' || club.trim().length === 0) continue;
      if (!coverage[club]) {
        coverage[club] = { completed: 0, lastCompletedAt: null };
      }

      coverage[club].completed += 1;
      coverage[club].lastCompletedAt = coverage[club].lastCompletedAt
        ? Math.max(coverage[club].lastCompletedAt, safeTs)
        : safeTs;
    }
  }

  return coverage;
}

function mapFillGapSuggestion(suggestion: BagSuggestion): BagPracticeRecommendation | null {
  if (!suggestion.lowerClubId || !suggestion.upperClubId) return null;

  return {
    id: `practice_fill_gap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
    titleKey: 'bag.practice.fill_gap.title',
    descriptionKey: 'bag.practice.fill_gap.description',
    targetClubs: [suggestion.lowerClubId, suggestion.upperClubId],
    targetSampleCount: 16,
    sourceSuggestionId: suggestion.id,
    status: 'new',
    priorityScore: 0,
    lastCompletedAt: null,
  };
}

function mapOverlapSuggestion(suggestion: BagSuggestion): BagPracticeRecommendation | null {
  if (!suggestion.lowerClubId || !suggestion.upperClubId) return null;

  return {
    id: `practice_reduce_overlap:${suggestion.lowerClubId}:${suggestion.upperClubId}`,
    titleKey: 'bag.practice.reduce_overlap.title',
    descriptionKey: 'bag.practice.reduce_overlap.description',
    targetClubs: [suggestion.lowerClubId, suggestion.upperClubId],
    targetSampleCount: 12,
    sourceSuggestionId: suggestion.id,
    status: 'new',
    priorityScore: 0,
    lastCompletedAt: null,
  };
}

function mapCalibrateSuggestion(suggestion: BagSuggestion): BagPracticeRecommendation | null {
  if (!suggestion.clubId) return null;

  const needsMoreSamples = suggestion.severity !== 'high';

  return {
    id: `practice_calibrate:${suggestion.clubId}`,
    titleKey: 'bag.practice.calibrate.title',
    descriptionKey: needsMoreSamples
      ? 'bag.practice.calibrate.more_samples.description'
      : 'bag.practice.calibrate.no_data.description',
    targetClubs: [suggestion.clubId],
    targetSampleCount: needsMoreSamples ? 10 : 8,
    sourceSuggestionId: suggestion.id,
    status: 'new',
    priorityScore: 0,
    lastCompletedAt: null,
  };
}

function computeRecommendationStatus(
  recommendation: BagPracticeRecommendation,
  coverage: MissionCoverageByClub,
  history: PracticeMissionHistoryEntry[],
  windowDays: number,
  now: Date,
  originalIndex: number,
): BagPracticeRecommendation & { originalIndex: number } {
  const historyAvailable = Array.isArray(history) && history.length > 0;

  if (!historyAvailable) {
    return {
      ...recommendation,
      status: 'new',
      priorityScore: 0,
      lastCompletedAt: null,
      originalIndex,
    };
  }

  const nowMs = now.getTime();
  const staleMs = Math.max(1, Math.floor(windowDays / 2)) * DAY_MS;

  let totalCompletions = 0;
  let lastCompletedAt: number | null = null;

  for (const club of recommendation.targetClubs) {
    const clubCoverage = coverage[club];
    if (!clubCoverage) continue;

    totalCompletions += clubCoverage.completed;
    if (clubCoverage.lastCompletedAt != null) {
      lastCompletedAt = lastCompletedAt != null
        ? Math.max(lastCompletedAt, clubCoverage.lastCompletedAt)
        : clubCoverage.lastCompletedAt;
    }
  }

  let status: BagPracticeRecommendation['status'];
  if (totalCompletions === 0) {
    status = 'new';
  } else if (!lastCompletedAt || nowMs - lastCompletedAt > staleMs) {
    status = 'due';
  } else {
    status = 'fresh';
  }

  const streak = computeMissionStreak(history, recommendation.id, now);
  const streakBonus = streak.consecutiveDays > 0 ? 5 : 0;
  const coverageBonus = Math.max(0, 5 - totalCompletions);

  let priorityScore = 0;
  if (status === 'new') priorityScore += 40;
  else if (status === 'due') priorityScore += 25;
  else priorityScore += 10;

  priorityScore += streakBonus + coverageBonus;

  return {
    ...recommendation,
    status,
    priorityScore,
    lastCompletedAt: lastCompletedAt != null ? new Date(lastCompletedAt) : null,
    originalIndex,
  };
}

export function buildBagPracticeRecommendations(
  overview: BagReadinessOverview | null | undefined,
  suggestions?: BagSuggestion[] | null,
  history?: PracticeMissionHistoryEntry[] | null,
  options: { windowDays?: number; now?: Date } = {},
): BagPracticeRecommendation[] {
  try {
    if (!overview) return [];
    if (overview.readiness.grade === 'excellent') return [];

    const windowDays = options.windowDays ?? DEFAULT_HISTORY_WINDOW_DAYS;
    const now = options.now ?? new Date();

    const mapped = (suggestions ?? overview.suggestions ?? [])
      .map((suggestion) => {
        if (suggestion.type === 'fill_gap') return mapFillGapSuggestion(suggestion);
        if (suggestion.type === 'reduce_overlap') return mapOverlapSuggestion(suggestion);
        if (suggestion.type === 'calibrate') return mapCalibrateSuggestion(suggestion);
        return null;
      })
      .filter((rec): rec is BagPracticeRecommendation => Boolean(rec));

    if (mapped.length === 0) return [];

    const coverage = buildMissionCoverageByClub(history ?? [], { windowDays, now });

    return mapped
      .map((rec, index) => computeRecommendationStatus(rec, coverage, history ?? [], windowDays, now, index))
      .sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
        return a.originalIndex - b.originalIndex;
      })
      .map(({ originalIndex, ...rec }) => rec);
  } catch (err) {
    console.warn('[bag] Failed to build practice recommendation', err);
    return [];
  }
}

export function buildBagPracticeRecommendation(
  overview: BagReadinessOverview | null | undefined,
  suggestions?: BagSuggestion[] | null,
  history?: PracticeMissionHistoryEntry[] | null,
  options: { windowDays?: number; now?: Date } = {},
): BagPracticeRecommendation | null {
  const [first] = buildBagPracticeRecommendations(overview, suggestions, history, options);
  return first ?? null;
}
