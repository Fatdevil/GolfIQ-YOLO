import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RootStackParamList } from '@app/navigation/types';
import RangePracticeScreen from '@app/screens/RangePracticeScreen';
import * as trainingGoalStorage from '@app/range/rangeTrainingGoalStorage';
import * as bagClient from '@app/api/bagClient';
import * as bagStatsClient from '@app/api/bagStatsClient';
import * as bagReadiness from '@shared/caddie/bagReadiness';
import * as bagPracticeRecommendations from '@shared/caddie/bagPracticeRecommendations';

vi.mock('@app/range/rangeTrainingGoalStorage', () => ({
  loadCurrentTrainingGoal: vi.fn(),
}));
vi.mock('@app/api/bagClient', () => ({
  fetchPlayerBag: vi.fn(),
}));
vi.mock('@app/api/bagStatsClient', () => ({
  fetchBagStats: vi.fn(),
}));
vi.mock('@shared/caddie/bagReadiness', () => ({
  buildBagReadinessOverview: vi.fn(),
}));
vi.mock('@shared/caddie/bagPracticeRecommendations', () => ({
  buildBagPracticeRecommendation: vi.fn(),
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
  beforeEach(() => {
    vi.mocked(trainingGoalStorage.loadCurrentTrainingGoal).mockResolvedValue(null);
    vi.mocked(bagClient.fetchPlayerBag).mockResolvedValue({
      clubs: [
        { clubId: '8i', label: '8 iron', active: true },
        { clubId: '9i', label: '9 iron', active: true },
      ],
    } as any);
    vi.mocked(bagStatsClient.fetchBagStats).mockResolvedValue({});
    vi.mocked(bagReadiness.buildBagReadinessOverview).mockReturnValue({
      readiness: {
        score: 50,
        grade: 'okay',
        totalClubs: 2,
        calibratedClubs: 0,
        needsMoreSamplesCount: 0,
        noDataCount: 0,
        largeGapCount: 0,
        overlapCount: 0,
      },
      suggestions: [],
      dataStatusByClubId: {},
    });
    vi.mocked(bagPracticeRecommendations.buildBagPracticeRecommendation).mockReturnValue(null);
  });

  it('navigates to range history when CTA pressed', () => {
    const navigation = createNavigation();

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-history-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeHistory');
  });

  it('shows empty training goal state', async () => {
    const navigation = createNavigation();

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

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-progress-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeProgress');
  });

  it('navigates to missions when CTA pressed', () => {
    const navigation = createNavigation();

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    fireEvent.click(screen.getByTestId('range-missions-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeMissions');
  });

  it('shows practice recommendation and routes with params', async () => {
    const navigation = createNavigation();
    const recommendation = {
      id: 'practice_fill_gap:8i:9i',
      titleKey: 'bag.practice.fill_gap.title',
      descriptionKey: 'bag.practice.fill_gap.description',
      targetClubs: ['8i', '9i'],
      targetSampleCount: 16,
      sourceSuggestionId: 'fill_gap:8i:9i',
    } as bagPracticeRecommendations.BagPracticeRecommendation;

    vi.mocked(bagPracticeRecommendations.buildBagPracticeRecommendation).mockReturnValue(recommendation);

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    expect(await screen.findByTestId('range-recommendation-card')).toHaveTextContent('Practice gapping 8 iron & 9 iron');

    fireEvent.click(screen.getByTestId('range-recommendation-cta'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeQuickPracticeStart', {
      practiceRecommendation: recommendation,
    });
  });

  it('hides recommendation card when no suggestion', async () => {
    const navigation = createNavigation();
    vi.mocked(bagPracticeRecommendations.buildBagPracticeRecommendation).mockReturnValue(null);

    render(<RangePracticeScreen navigation={navigation} route={{ key: 'RangePractice', name: 'RangePractice' } as Props['route']} />);

    expect(await screen.findByTestId('training-goal-card')).toBeInTheDocument();
    expect(screen.queryByTestId('range-recommendation-card')).toBeNull();
  });
});
