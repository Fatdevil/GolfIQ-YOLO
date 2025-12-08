import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import RangeQuickPracticeStartScreen from '@app/screens/RangeQuickPracticeStartScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as trainingGoalStorage from '@app/range/rangeTrainingGoalStorage';

vi.mock('@app/range/rangeTrainingGoalStorage', () => ({
  loadCurrentTrainingGoal: vi.fn(),
}));

type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeStart'>;

function createNavigation(): Props['navigation'] {
  return {
    navigate: vi.fn(),
    setParams: vi.fn(),
    goBack: vi.fn(),
  } as unknown as Props['navigation'];
}

function createRoute(params?: Props['route']['params']): Props['route'] {
  return {
    key: 'RangeQuickPracticeStart',
    name: 'RangeQuickPracticeStart',
    params,
  } as Props['route'];
}

describe('RangeQuickPracticeStartScreen', () => {
  it('defaults to down-the-line and allows switching angle', () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);
    render(<RangeQuickPracticeStartScreen navigation={navigation} route={createRoute()} />);

    expect(screen.getByTestId('selected-angle-label')).toHaveTextContent('Down-the-line');

    fireEvent.click(screen.getByTestId('angle-option-face'));
    expect(screen.getByTestId('selected-angle-label')).toHaveTextContent('Face-on');
  });

  it('navigates to camera setup with selected params', () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);
    render(<RangeQuickPracticeStartScreen navigation={navigation} route={createRoute()} />);

    fireEvent.change(screen.getByTestId('club-input'), { target: { value: '7i' } });
    fireEvent.change(screen.getByTestId('target-input'), { target: { value: '145' } });
    fireEvent.click(screen.getByTestId('angle-option-face'));

    fireEvent.click(screen.getByTestId('start-quick-practice'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'RangeCameraSetup',
      expect.objectContaining({
        club: '7i',
        targetDistanceM: 145,
        cameraAngle: 'face_on',
        missionId: undefined,
      }),
    );
  });

  it('shows current training goal inline when available', async () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue({
      id: 'goal-1',
      text: 'Work on start line',
      createdAt: '2024-01-01T00:00:00.000Z',
    });

    render(<RangeQuickPracticeStartScreen navigation={navigation} route={createRoute()} />);

    await screen.findByText('Current goal: Work on start line');
  });

  it('surfaces mission details when provided', () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);

    render(
      <RangeQuickPracticeStartScreen
        navigation={navigation}
        route={createRoute({ missionId: 'solid_contact_wedges' })}
      />,
    );

    expect(screen.getByTestId('mission-banner')).toHaveTextContent('Solid contact with wedges');
    fireEvent.click(screen.getByTestId('start-quick-practice'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'RangeCameraSetup',
      expect.objectContaining({ missionId: 'solid_contact_wedges' }),
    );
  });

  it('prefills club and surfaces recommendation details when provided', async () => {
    const navigation = createNavigation();
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);

    render(
      <RangeQuickPracticeStartScreen
        navigation={navigation}
        route={createRoute({
          practiceRecommendation: {
            id: 'practice_calibrate:pw',
            titleKey: 'bag.practice.calibrate.title',
            descriptionKey: 'bag.practice.calibrate.more_samples.description',
            targetClubs: ['PW'],
            sourceSuggestionId: 'calibrate:pw',
          },
        })}
      />,
    );

    expect(await screen.findByTestId('range-start-recommendation')).toHaveTextContent('Based on your bag readiness');
    expect(screen.getByTestId('club-input')).toHaveValue('PW');
  });
});
