import { buildWeeklyPracticeGoalProgress, type PracticeGoalProgress } from './practiceGoals';
import {
  DEFAULT_TARGET_MISSIONS_PER_WEEK,
  normalizeWeeklyPracticeGoalSettings,
  type WeeklyPracticeGoalSettings,
} from './practiceGoalSettings';
import type { PracticeMissionHistoryEntry } from './practiceHistory';

export type WeeklyGoalNudgeResult = {
  shouldShow: boolean;
  remainingMissions: number;
  completionPercent: number;
  progress: PracticeGoalProgress;
};

export function shouldShowWeeklyGoalNudge(
  history: PracticeMissionHistoryEntry[],
  goalSettings: WeeklyPracticeGoalSettings | null | undefined,
  now: Date = new Date(),
): WeeklyGoalNudgeResult {
  const normalizedSettings = normalizeWeeklyPracticeGoalSettings(goalSettings);
  const target = normalizedSettings.targetMissionsPerWeek ?? DEFAULT_TARGET_MISSIONS_PER_WEEK;

  const progress = buildWeeklyPracticeGoalProgress({
    missionHistory: history,
    now,
    targetMissionsPerWeek: target,
  });

  const remainingMissions = Math.max(0, progress.targetCompletions - progress.completedInWindow);
  const completionPercent = progress.targetCompletions
    ? Math.min(progress.completedInWindow / progress.targetCompletions, 1)
    : 0;

  const hasProgress = progress.completedInWindow > 0;
  const closeToGoal = (remainingMissions <= 1 && hasProgress) || completionPercent >= 0.8;
  const hasActiveGoal = target > 0;
  const inWindow = progress.status === 'not_started' || progress.status === 'in_progress';

  const shouldShow = Boolean(hasActiveGoal && inWindow && closeToGoal);

  return {
    shouldShow,
    remainingMissions,
    completionPercent,
    progress,
  };
}
