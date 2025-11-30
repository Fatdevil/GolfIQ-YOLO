import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import RangeTrainingGoalScreen from '@app/screens/RangeTrainingGoalScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as trainingGoalStorage from '@app/range/rangeTrainingGoalStorage';

vi.mock('@app/range/rangeTrainingGoalStorage', () => ({
  loadCurrentTrainingGoal: vi.fn(),
  saveCurrentTrainingGoal: vi.fn(),
  clearCurrentTrainingGoal: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'RangeTrainingGoal'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Props['navigation'];
}

describe('RangeTrainingGoalScreen', () => {
  beforeEach(() => {
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);
    vi.mocked(trainingGoalStorage.saveCurrentTrainingGoal).mockResolvedValue({
      id: 'goal-1',
      text: 'Saved goal',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
    vi.mocked(trainingGoalStorage.clearCurrentTrainingGoal).mockResolvedValue();
  });

  it('prefills existing goal text', async () => {
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue({
      id: 'goal-1',
      text: 'Work on tempo',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    render(<RangeTrainingGoalScreen navigation={createNavigation()} route={{ key: 'RangeTrainingGoal', name: 'RangeTrainingGoal' } as Props['route']} />);

    expect(await screen.findByDisplayValue('Work on tempo')).toBeInTheDocument();
  });

  it('saves new goal and navigates back', async () => {
    const navigation = createNavigation();
    render(<RangeTrainingGoalScreen navigation={navigation} route={{ key: 'RangeTrainingGoal', name: 'RangeTrainingGoal' } as Props['route']} />);

    fireEvent.change(await screen.findByTestId('training-goal-input'), { target: { value: 'Stay centered' } });
    fireEvent.click(screen.getByTestId('save-training-goal'));

    await waitFor(() => {
      expect(trainingGoalStorage.saveCurrentTrainingGoal).toHaveBeenCalledWith('Stay centered');
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });

  it('clears goal when clear button pressed', async () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue({
      id: 'goal-1',
      text: 'Existing goal',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    render(<RangeTrainingGoalScreen navigation={navigation} route={{ key: 'RangeTrainingGoal', name: 'RangeTrainingGoal' } as Props['route']} />);

    fireEvent.click(await screen.findByTestId('clear-training-goal'));

    await waitFor(() => {
      expect(trainingGoalStorage.clearCurrentTrainingGoal).toHaveBeenCalled();
      expect(navigation.goBack).toHaveBeenCalled();
    });
  });
});
