import { getItem, setItem } from '@app/storage/asyncStorage';
import {
  getDefaultWeeklyPracticeGoalSettings,
  normalizeWeeklyPracticeGoalSettings,
  type WeeklyPracticeGoalSettings,
} from '@shared/practice/practiceGoalSettings';

export const WEEKLY_PRACTICE_GOAL_SETTINGS_KEY = 'weeklyPracticeGoalSettings:v1';

export async function loadWeeklyPracticeGoalSettings(): Promise<WeeklyPracticeGoalSettings> {
  try {
    const raw = await getItem(WEEKLY_PRACTICE_GOAL_SETTINGS_KEY);
    if (!raw) return getDefaultWeeklyPracticeGoalSettings();

    const parsed = JSON.parse(raw) as Partial<WeeklyPracticeGoalSettings>;
    return normalizeWeeklyPracticeGoalSettings(parsed);
  } catch (err) {
    console.warn('[practiceGoalSettings] Failed to load weekly goal settings', err);
    return getDefaultWeeklyPracticeGoalSettings();
  }
}

export async function saveWeeklyPracticeGoalSettings(
  settings: WeeklyPracticeGoalSettings,
): Promise<void> {
  try {
    const payload: WeeklyPracticeGoalSettings = {
      targetMissionsPerWeek: settings.targetMissionsPerWeek,
    };
    await setItem(WEEKLY_PRACTICE_GOAL_SETTINGS_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[practiceGoalSettings] Failed to save weekly goal settings', err);
  }
}
