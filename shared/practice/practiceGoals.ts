import { computeRecentCompletionSummary, type PracticeMissionHistoryEntry } from './practiceHistory';

export const PRACTICE_GOAL_WINDOW_DAYS = 7;
export const DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL = 3;

export type PracticeGoalProgress = {
  goalId: 'weekly_mission_completions';
  targetCompletions: number;
  completedInWindow: number;
  remainingToTarget: number;
  windowDays: number;
  isOnTrack: boolean;
};

export function buildWeeklyPracticeGoalProgress(args: {
  missionHistory: PracticeMissionHistoryEntry[];
  now?: Date;
  targetCompletions?: number;
  windowDays?: number;
}): PracticeGoalProgress {
  const {
    missionHistory,
    now = new Date(),
    targetCompletions = DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL,
    windowDays = PRACTICE_GOAL_WINDOW_DAYS,
  } = args;

  const summary = computeRecentCompletionSummary(missionHistory, windowDays, now);
  const completedInWindow = summary.completed;
  const remainingToTarget = Math.max(0, targetCompletions - completedInWindow);

  return {
    goalId: 'weekly_mission_completions',
    targetCompletions,
    completedInWindow,
    remainingToTarget,
    windowDays,
    isOnTrack: completedInWindow >= targetCompletions,
  };
}
