import { PRACTICE_GOAL_WINDOW_DAYS, buildWeeklyPracticeGoalProgress } from './practiceGoals';
import { computeRecentCompletionSummary, type PracticeMissionHistoryEntry } from './practiceHistory';
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

function normalizeWeekStart(anchor: Date): Date {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - PRACTICE_GOAL_WINDOW_DAYS);
  return start;
}

function buildSnapshot({
  history,
  missions,
  now,
}: {
  history: PracticeMissionHistoryEntry[];
  missions: PracticeMissionListItem[];
  now: Date;
}): WeeklyPracticeSnapshot {
  const goal = buildWeeklyPracticeGoalProgress({ missionHistory: history, now });
  const plan: WeeklyPracticePlanStatus = buildWeeklyPracticePlanStatus({ missions, history, now });
  const summary = computeRecentCompletionSummary(history, PRACTICE_GOAL_WINDOW_DAYS, now);

  return {
    weekStart: normalizeWeekStart(now),
    missionsCompleted: summary.completed,
    goalReached: goal.status === 'goal_reached' || goal.status === 'exceeded',
    planCompleted: plan.isPlanCompleted,
  };
}

export function buildWeeklyPracticeComparison(options: {
  history: PracticeMissionHistoryEntry[];
  missions: PracticeMissionListItem[];
  now?: Date;
}): WeeklyPracticeComparison {
  const { history, missions, now = new Date() } = options;
  const safeHistory = history ?? [];
  const safeMissions = missions ?? [];

  const thisWeek = buildSnapshot({ history: safeHistory, missions: safeMissions, now });
  const lastWeekEnd = new Date(thisWeek.weekStart.getTime() - 1);
  const lastWeek = buildSnapshot({ history: safeHistory, missions: safeMissions, now: lastWeekEnd });

  return { thisWeek, lastWeek };
}
