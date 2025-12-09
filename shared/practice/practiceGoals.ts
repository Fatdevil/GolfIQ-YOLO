import { computeRecentCompletionSummary, type PracticeMissionHistoryEntry } from './practiceHistory';

export const PRACTICE_GOAL_WINDOW_DAYS = 7;
export const DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL = 3;

export type PracticeGoalStatus =
  | 'not_started'
  | 'in_progress'
  | 'goal_reached'
  | 'exceeded';

export type PracticeGoalProgress = {
  goalId: 'weekly_mission_completions';
  targetCompletions: number;
  completedInWindow: number;
  remainingToTarget: number;
  windowDays: number;
  status: PracticeGoalStatus;
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

  let status: PracticeGoalStatus = 'not_started';
  if (completedInWindow === 0) {
    status = 'not_started';
  } else if (completedInWindow < targetCompletions) {
    status = 'in_progress';
  } else if (completedInWindow === targetCompletions) {
    status = 'goal_reached';
  } else if (completedInWindow > targetCompletions) {
    status = 'exceeded';
  }

  return {
    goalId: 'weekly_mission_completions',
    targetCompletions,
    completedInWindow,
    remainingToTarget,
    windowDays,
    status,
    isOnTrack: status === 'goal_reached' || status === 'exceeded',
  };
}

export function didJustReachWeeklyGoal(args: {
  before: PracticeGoalProgress;
  after: PracticeGoalProgress;
}): boolean {
  const { before, after } = args;

  const wasComplete = before.status === 'goal_reached' || before.status === 'exceeded';
  const isComplete = after.status === 'goal_reached' || after.status === 'exceeded';

  return !wasComplete && isComplete;
}
