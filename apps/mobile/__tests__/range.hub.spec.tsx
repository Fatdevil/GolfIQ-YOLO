import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RootStackParamList } from '@app/navigation/types';
import RangePracticeScreen from '@app/screens/RangePracticeScreen';
import * as trainingGoalStorage from '@app/range/rangeTrainingGoalStorage';

vi.mock('@app/range/rangeTrainingGoalStorage', () => ({
  loadCurrentTrainingGoal: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'RangePractice'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
    replace: vi.fn(),
  } as unknown as Props['navigation'];
}

describe('RangePracticeScreen', () => {
  it('navigates to range history when CTA pressed', () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-history-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeHistory');
  });

  it('shows empty training goal state', async () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    expect(await screen.findByText('No training goal set')).toBeInTheDocument();
    expect(screen.getByText('Set a focus for your practice sessions.')).toBeInTheDocument();
  });

  it('shows current training goal when available', async () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue({
      id: 'goal-1',
      text: 'Hit controlled fades',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    expect(await screen.findByText('Hit controlled fades')).toBeInTheDocument();
    expect(screen.getByText('Change goal')).toBeInTheDocument();
  });

  it('navigates to range progress when CTA pressed', () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-progress-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeProgress');
  });

  it('navigates to missions when CTA pressed', () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-missions-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeMissions');
  });
});
