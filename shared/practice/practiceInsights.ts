import { PRACTICE_GOAL_WINDOW_DAYS, buildWeeklyPracticeGoalProgress } from './practiceGoals';
import {
  computeRecentCompletionSummary,
  normalizePracticeWeekStart,
  type PracticeMissionHistoryEntry,
} from './practiceHistory';
import { buildWeeklyPracticePlanStatus, type WeeklyPracticePlanStatus } from './practicePlan';
import type { PracticeMissionListItem } from './practiceMissionsList';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface WeeklyPracticeSnapshot {
  weekStart: Date;
  missionsCompleted: number;
  goalReached: boolean;
  planCompleted: boolean;
}

export interface WeeklyPracticeComparison {
  thisWeek: WeeklyPracticeSnapshot;
  lastWeek: WeeklyPracticeSnapshot;
}

function buildSnapshot({
  history,
  missions,
  now,
  targetMissionsPerWeek,
}: {
  history: PracticeMissionHistoryEntry[];
  missions: PracticeMissionListItem[];
  now: Date;
  targetMissionsPerWeek?: number;
}): WeeklyPracticeSnapshot {
  const goal = buildWeeklyPracticeGoalProgress({
    missionHistory: history,
    now,
    targetMissionsPerWeek,
  });
  const plan: WeeklyPracticePlanStatus = buildWeeklyPracticePlanStatus({
    missions,
    history,
    now,
    targetMissionsPerWeek,
  });
  const summary = computeRecentCompletionSummary(history, PRACTICE_GOAL_WINDOW_DAYS, now);

  return {
    weekStart: normalizePracticeWeekStart(now),
    missionsCompleted: summary.completed,
    goalReached: goal.status === 'goal_reached' || goal.status === 'exceeded',
    planCompleted: plan.isPlanCompleted,
  };
}

export function buildWeeklyPracticeComparison(options: {
  history: PracticeMissionHistoryEntry[];
  missions: PracticeMissionListItem[];
  now?: Date;
  targetMissionsPerWeek?: number;
}): WeeklyPracticeComparison {
  const { history, missions, now = new Date(), targetMissionsPerWeek } = options;
  const safeHistory = history ?? [];
  const safeMissions = missions ?? [];

  const thisWeek = buildSnapshot({
    history: safeHistory,
    missions: safeMissions,
    now,
    targetMissionsPerWeek,
  });
  const lastWeekEnd = new Date(thisWeek.weekStart.getTime() - 1);
  const lastWeek = buildSnapshot({
    history: safeHistory,
    missions: safeMissions,
    now: lastWeekEnd,
    targetMissionsPerWeek,
  });

  return { thisWeek, lastWeek };
}
