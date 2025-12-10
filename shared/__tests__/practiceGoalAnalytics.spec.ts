import { describe, expect, it, vi } from 'vitest';

import {
  buildWeeklyPracticeGoalSettingsUpdatedEvent,
  trackWeeklyPracticeGoalSettingsUpdated,
} from '../practice/practiceGoalAnalytics';
import { DEFAULT_TARGET_MISSIONS_PER_WEEK } from '../practice/practiceGoalSettings';

describe('practiceGoalAnalytics', () => {
  it('marks default to custom transitions', () => {
    const event = buildWeeklyPracticeGoalSettingsUpdatedEvent({
      previousTarget: undefined,
      newTarget: 5,
      source: 'mobile_settings_screen',
    });

    expect(event).toEqual({
      previousTarget: null,
      newTarget: 5,
      source: 'mobile_settings_screen',
      isDefaultBefore: true,
      isDefaultAfter: false,
    });
  });

  it('keeps custom flags for custom to custom updates', () => {
    const event = buildWeeklyPracticeGoalSettingsUpdatedEvent({
      previousTarget: 4,
      newTarget: 5,
      source: 'web_home_inline',
    });

    expect(event.isDefaultBefore).toBe(false);
    expect(event.isDefaultAfter).toBe(false);
  });

  it('detects resets back to the default target', () => {
    const event = buildWeeklyPracticeGoalSettingsUpdatedEvent({
      previousTarget: 4,
      newTarget: DEFAULT_TARGET_MISSIONS_PER_WEEK,
      source: 'web_home_inline',
    });

    expect(event.isDefaultBefore).toBe(false);
    expect(event.isDefaultAfter).toBe(true);
  });

  it('emits telemetry with computed payload', () => {
    const emit = vi.fn();

    trackWeeklyPracticeGoalSettingsUpdated(
      { emit },
      { previousTarget: 3, newTarget: 5, source: 'mobile_settings_screen' },
    );

    expect(emit).toHaveBeenCalledWith('practice_goal_settings_updated', {
      previousTarget: 3,
      newTarget: 5,
      source: 'mobile_settings_screen',
      isDefaultBefore: true,
      isDefaultAfter: false,
    });
  });
});
