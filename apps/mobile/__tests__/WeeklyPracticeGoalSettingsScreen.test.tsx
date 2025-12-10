import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WeeklyPracticeGoalSettingsScreen from '@app/screens/WeeklyPracticeGoalSettingsScreen';
import type { RootStackParamList } from '@app/navigation/types';
import {
  loadWeeklyPracticeGoalSettings,
  saveWeeklyPracticeGoalSettings,
} from '@app/storage/practiceGoalSettings';
import { safeEmit } from '@app/telemetry';

vi.mock('@app/storage/practiceGoalSettings', () => ({
  loadWeeklyPracticeGoalSettings: vi.fn(),
  saveWeeklyPracticeGoalSettings: vi.fn(),
}));

vi.mock('@app/telemetry', () => ({
  safeEmit: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'WeeklyPracticeGoalSettings'>;

type Navigation = Props['navigation'];

type Route = Props['route'];

function createNavigation(): Navigation {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Navigation;
}

function createRoute(): Route {
  return { key: 'WeeklyPracticeGoalSettings', name: 'WeeklyPracticeGoalSettings' } as Route;
}

describe('WeeklyPracticeGoalSettingsScreen', () => {
  beforeEach(() => {
    vi.mocked(loadWeeklyPracticeGoalSettings).mockResolvedValue({ targetMissionsPerWeek: 3 });
    vi.mocked(saveWeeklyPracticeGoalSettings).mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('emits analytics when the weekly target changes', async () => {
    const navigation = createNavigation();

    render(<WeeklyPracticeGoalSettingsScreen navigation={navigation} route={createRoute()} />);

    await screen.findByTestId('weekly-practice-goal-settings');

    fireEvent.click(screen.getByTestId('weekly-goal-option-5'));

    await waitFor(() => {
      expect(saveWeeklyPracticeGoalSettings).toHaveBeenCalledWith({
        targetMissionsPerWeek: 5,
      });
    });
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());

    expect(vi.mocked(safeEmit)).toHaveBeenCalledWith('practice_goal_settings_updated', {
      previousTarget: 3,
      newTarget: 5,
      source: 'mobile_settings_screen',
      isDefaultBefore: true,
      isDefaultAfter: false,
    });
  });

  it('does not emit analytics when selecting the current target', async () => {
    const navigation = createNavigation();

    render(<WeeklyPracticeGoalSettingsScreen navigation={navigation} route={createRoute()} />);

    await screen.findByTestId('weekly-practice-goal-settings');

    fireEvent.click(screen.getByTestId('weekly-goal-option-3'));

    expect(saveWeeklyPracticeGoalSettings).not.toHaveBeenCalled();
    expect(vi.mocked(safeEmit)).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
