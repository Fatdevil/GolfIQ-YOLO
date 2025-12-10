export interface WeeklyPracticeGoalSettings {
  targetMissionsPerWeek: number;
}

export const DEFAULT_TARGET_MISSIONS_PER_WEEK = 3;

export function isDefaultWeeklyPracticeGoalTarget(target: number | null | undefined): boolean {
  if (target == null) return true;
  return target === DEFAULT_TARGET_MISSIONS_PER_WEEK;
}

export function getDefaultWeeklyPracticeGoalSettings(): WeeklyPracticeGoalSettings {
  return { targetMissionsPerWeek: DEFAULT_TARGET_MISSIONS_PER_WEEK };
}

export function normalizeWeeklyPracticeGoalSettings(
  raw: Partial<WeeklyPracticeGoalSettings> | null | undefined,
): WeeklyPracticeGoalSettings {
  const defaultSettings = getDefaultWeeklyPracticeGoalSettings();
  if (!raw) return defaultSettings;

  const { targetMissionsPerWeek } = raw;
  if (typeof targetMissionsPerWeek !== 'number' || !Number.isFinite(targetMissionsPerWeek) || targetMissionsPerWeek <= 0) {
    return defaultSettings;
  }

  return { targetMissionsPerWeek };
}
