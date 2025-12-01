import { fireEvent, render, screen } from '@testing-library/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import RangeQuickPracticeSummaryScreen from '@app/screens/RangeQuickPracticeSummaryScreen';
import type { RootStackParamList } from '@app/navigation/types';

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

  it('navigates to session detail when requested', () => {
    const navigation = createNavigation();
    render(
      <RangeQuickPracticeSummaryScreen
        navigation={navigation}
        route={{ key: 'RangeQuickPracticeSummary', name: 'RangeQuickPracticeSummary', params: { summary } }}
      />,
    );

    fireEvent.click(screen.getByTestId('summary-view-details'));

    expect(navigation.navigate).toHaveBeenCalledWith('RangeSessionDetail', { summary });
  });
});
