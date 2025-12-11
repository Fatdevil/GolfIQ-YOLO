import {
  PRACTICE_WEEK_WINDOW_DAYS,
  selectRecentMissions,
  type PracticeMissionHistoryEntry,
} from './practiceHistory';
import {
  buildWeeklyPracticeGoalProgress,
  type PracticeGoalProgress,
} from './practiceGoals';
import {
  getDefaultWeeklyPracticeGoalSettings,
  normalizeWeeklyPracticeGoalSettings,
  type WeeklyPracticeGoalSettings,
} from './practiceGoalSettings';

export type PracticeReadinessSummary = {
  /** Number of practice sessions completed in the window. */
  sessionsCompleted: number;
  /** Total completed shot samples in the window. */
  shotsCompleted: number;
  /** Weekly goal target (null when no goal is configured). */
  goalTarget: number | null;
  /** Current progress toward the weekly goal. */
  goalProgress: number;
  /** Whether the weekly goal has been reached or exceeded. */
  goalReached: boolean;
  /** Days considered when computing the summary. */
  windowDays: number;
};

export interface BuildPracticeReadinessSummaryOptions {
  history?: PracticeMissionHistoryEntry[];
  goalSettings?: WeeklyPracticeGoalSettings | null;
  now?: Date;
  weeks?: number;
}

export function buildPracticeReadinessSummary(
  options: BuildPracticeReadinessSummaryOptions,
): PracticeReadinessSummary {
  const { history = [], goalSettings, now = new Date(), weeks = 1 } = options;
  const safeHistory = Array.isArray(history) ? history : [];
  const safeWeeks = weeks > 0 ? weeks : 1;
  const windowDays = safeWeeks * PRACTICE_WEEK_WINDOW_DAYS;

  const recentEntries = selectRecentMissions(safeHistory, { daysBack: windowDays }, now);
  const completedEntries = recentEntries.filter((entry) => entry.status === 'completed');

  const sessionsCompleted = completedEntries.length;
  const shotsCompleted = completedEntries.reduce(
    (total, entry) => total + (typeof entry.completedSampleCount === 'number' ? entry.completedSampleCount : 0),
    0,
  );

  const targetSettings = goalSettings === null
    ? null
    : goalSettings
      ? normalizeWeeklyPracticeGoalSettings(goalSettings)
      : getDefaultWeeklyPracticeGoalSettings();

  let goalProgress: PracticeGoalProgress | null = null;
  if (targetSettings) {
    goalProgress = buildWeeklyPracticeGoalProgress({
      missionHistory: safeHistory,
      now,
      targetMissionsPerWeek: targetSettings.targetMissionsPerWeek,
      windowDays,
    });
  }

  return {
    sessionsCompleted,
    shotsCompleted,
    goalTarget: targetSettings ? goalProgress?.targetCompletions ?? targetSettings.targetMissionsPerWeek : null,
    goalProgress: goalProgress?.completedInWindow ?? 0,
    goalReached: goalProgress ? goalProgress.status === 'goal_reached' || goalProgress.status === 'exceeded' : false,
    windowDays,
  };
}
