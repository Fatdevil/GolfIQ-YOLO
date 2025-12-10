import { computeRecentCompletionSummary, type PracticeMissionHistoryEntry } from './practiceHistory';
import { DEFAULT_TARGET_MISSIONS_PER_WEEK } from './practiceGoalSettings';

export const PRACTICE_GOAL_WINDOW_DAYS = 7;

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

export type WeeklyGoalStreak = {
  currentStreakWeeks: number;
};

function isGoalComplete(status: PracticeGoalStatus): boolean {
  return status === 'goal_reached' || status === 'exceeded';
}

export interface BuildWeeklyPracticeGoalOptions {
  missionHistory: PracticeMissionHistoryEntry[];
  now?: Date;
  targetMissionsPerWeek?: number;
  windowDays?: number;
}

export function buildWeeklyPracticeGoalProgress(options: BuildWeeklyPracticeGoalOptions): PracticeGoalProgress {
  const {
    missionHistory,
    now = new Date(),
    targetMissionsPerWeek = DEFAULT_TARGET_MISSIONS_PER_WEEK,
    windowDays = PRACTICE_GOAL_WINDOW_DAYS,
  } = options;

  const summary = computeRecentCompletionSummary(missionHistory, windowDays, now);
  const completedInWindow = summary.completed;
  const targetCompletions = targetMissionsPerWeek;
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

  const wasComplete = isGoalComplete(before.status);
  const isComplete = isGoalComplete(after.status);

  return !wasComplete && isComplete;
}

export function buildWeeklyGoalStreak(
  history: PracticeMissionHistoryEntry[],
  now: Date = new Date(),
  targetMissionsPerWeek: number = DEFAULT_TARGET_MISSIONS_PER_WEEK,
): WeeklyGoalStreak {
  const windowMs = PRACTICE_GOAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let currentStreakWeeks = 0;
  let weekIndex = 0;

  const maxWeeksToCheck = 520;

  while (weekIndex < maxWeeksToCheck) {
    const weekEnd = new Date(now.getTime() - weekIndex * windowMs);
    const progress = buildWeeklyPracticeGoalProgress({
      missionHistory: history,
      now: weekEnd,
      targetMissionsPerWeek,
    });

    if (!isGoalComplete(progress.status)) {
      break;
    }

    currentStreakWeeks += 1;
    weekIndex += 1;
  }

  return { currentStreakWeeks };
}
