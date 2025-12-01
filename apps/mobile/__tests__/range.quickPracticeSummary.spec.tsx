import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RangeQuickPracticeSummaryScreen from '@app/screens/RangeQuickPracticeSummaryScreen';
import type { RootStackParamList } from '@app/navigation/types';
import * as summaryStorage from '@app/range/rangeSummaryStorage';
import * as historyStorage from '@app/range/rangeHistoryStorage';

vi.mock('@app/range/rangeSummaryStorage', () => ({
  saveLastRangeSessionSummary: vi.fn(),
}));

vi.mock('@app/range/rangeHistoryStorage', () => ({
  appendRangeHistoryEntry: vi.fn(),
}));

describe('RangeQuickPracticeSummaryScreen', () => {
  type Props = NativeStackScreenProps<RootStackParamList, 'RangeQuickPracticeSummary'>;

  const summary: NonNullable<Props['route']['params']>['summary'] = {
    id: 'summary-1',
    startedAt: '2024-04-01T00:00:00.000Z',
    finishedAt: '2024-04-01T00:20:00.000Z',
    club: '7i',
    targetDistanceM: 150,
    shotCount: 10,
    avgCarryM: 148,
    tendency: 'straight',
    trainingGoalText: 'Groove tempo',
  };

  function createNavigation(): Props['navigation'] {
    return {
      navigate: vi.fn(),
      setParams: vi.fn(),
      goBack: vi.fn(),
    } as unknown as Props['navigation'];
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to session detail when requested', async () => {
    const navigation = createNavigation();
    render(
      <RangeQuickPracticeSummaryScreen
        navigation={navigation}
        route={{ key: 'RangeQuickPracticeSummary', name: 'RangeQuickPracticeSummary', params: { summary } }}
      />,
    );

    fireEvent.click(screen.getByTestId('summary-view-details'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RangeSessionDetail', { summary });
    });
  });

  it('shows reflection inputs and persists rating/notes before navigating', async () => {
    const navigation = createNavigation();
    render(
      <RangeQuickPracticeSummaryScreen
        navigation={navigation}
        route={{ key: 'RangeQuickPracticeSummary', name: 'RangeQuickPracticeSummary', params: { summary } }}
      />,
    );

    expect(screen.getAllByText('Reflection').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('reflection-rating-4'));
    fireEvent.change(screen.getByTestId('reflection-notes'), { target: { value: 'Felt solid today' } });

    fireEvent.click(screen.getByTestId('summary-view-details'));

    await waitFor(() => {
      expect(summaryStorage.saveLastRangeSessionSummary).toHaveBeenCalledWith(
        expect.objectContaining({ sessionRating: 4, reflectionNotes: 'Felt solid today' }),
      );
      expect(historyStorage.appendRangeHistoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sessionRating: 4, reflectionNotes: 'Felt solid today' }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith('RangeSessionDetail', {
        summary: expect.objectContaining({ sessionRating: 4, reflectionNotes: 'Felt solid today' }),
      });
    });
  });

  it('persists history once per summary even when navigating multiple times', async () => {
    const navigation = createNavigation();
    render(
      <RangeQuickPracticeSummaryScreen
        navigation={navigation}
        route={{ key: 'RangeQuickPracticeSummary', name: 'RangeQuickPracticeSummary', params: { summary } }}
      />,
    );

    fireEvent.click(screen.getByTestId('reflection-rating-5'));
    fireEvent.change(screen.getByTestId('reflection-notes'), { target: { value: 'Great focus on tempo' } });

    fireEvent.click(screen.getByTestId('summary-view-details'));

    await waitFor(() => {
      expect(historyStorage.appendRangeHistoryEntry).toHaveBeenCalledTimes(1);
      expect(summaryStorage.saveLastRangeSessionSummary).toHaveBeenCalledTimes(1);
      expect(historyStorage.appendRangeHistoryEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sessionRating: 5, reflectionNotes: 'Great focus on tempo' }),
      );
      expect(navigation.navigate).toHaveBeenCalledWith('RangeSessionDetail', {
        summary: expect.objectContaining({ sessionRating: 5, reflectionNotes: 'Great focus on tempo' }),
      });
    });

    fireEvent.click(screen.getByTestId('summary-back-home'));

    await waitFor(() => {
      expect(historyStorage.appendRangeHistoryEntry).toHaveBeenCalledTimes(1);
      expect(summaryStorage.saveLastRangeSessionSummary).toHaveBeenCalledTimes(1);
      expect(navigation.navigate).toHaveBeenCalledWith('PlayerHome');
    });
  });
});
