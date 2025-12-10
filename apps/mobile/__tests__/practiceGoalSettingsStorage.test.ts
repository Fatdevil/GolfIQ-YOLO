import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadWeeklyPracticeGoalSettings,
  saveWeeklyPracticeGoalSettings,
  WEEKLY_PRACTICE_GOAL_SETTINGS_KEY,
} from '@app/storage/practiceGoalSettings';
import * as asyncStorage from '@app/storage/asyncStorage';
import { DEFAULT_TARGET_MISSIONS_PER_WEEK } from '@shared/practice/practiceGoalSettings';

describe('practiceGoalSettingsStorage', () => {
  beforeEach(() => {
    vi.spyOn(asyncStorage, 'getItem').mockResolvedValue(null);
    vi.spyOn(asyncStorage, 'setItem').mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the default target when nothing is stored', async () => {
    const settings = await loadWeeklyPracticeGoalSettings();

    expect(settings.targetMissionsPerWeek).toBe(DEFAULT_TARGET_MISSIONS_PER_WEEK);
  });

  it('returns the stored target when available', async () => {
    vi.mocked(asyncStorage.getItem).mockResolvedValueOnce(
      JSON.stringify({ targetMissionsPerWeek: 5 }),
    );

    const settings = await loadWeeklyPracticeGoalSettings();

    expect(settings.targetMissionsPerWeek).toBe(5);
  });

  it('persists the weekly target', async () => {
    await saveWeeklyPracticeGoalSettings({ targetMissionsPerWeek: 4 });

    expect(asyncStorage.setItem).toHaveBeenCalledWith(
      WEEKLY_PRACTICE_GOAL_SETTINGS_KEY,
      JSON.stringify({ targetMissionsPerWeek: 4 }),
    );
  });
});
