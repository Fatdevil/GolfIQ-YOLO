import {
  getDefaultWeeklyPracticeGoalSettings,
  normalizeWeeklyPracticeGoalSettings,
  type WeeklyPracticeGoalSettings,
} from "@shared/practice/practiceGoalSettings";

export const WEEKLY_PRACTICE_GOAL_SETTINGS_KEY = "weeklyPracticeGoalSettings:v1";

export function loadWeeklyPracticeGoalSettings(): WeeklyPracticeGoalSettings {
  try {
    const raw = window.localStorage.getItem(WEEKLY_PRACTICE_GOAL_SETTINGS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<WeeklyPracticeGoalSettings>) : null;
    return normalizeWeeklyPracticeGoalSettings(parsed);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[practiceGoalSettings] Failed to load weekly goal settings", err);
    return getDefaultWeeklyPracticeGoalSettings();
  }
}

export function saveWeeklyPracticeGoalSettings(
  settings: WeeklyPracticeGoalSettings,
): void {
  try {
    const payload: WeeklyPracticeGoalSettings = {
      targetMissionsPerWeek: settings.targetMissionsPerWeek,
    };
    window.localStorage.setItem(
      WEEKLY_PRACTICE_GOAL_SETTINGS_KEY,
      JSON.stringify(payload),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[practiceGoalSettings] Failed to save weekly goal settings", err);
  }
}
