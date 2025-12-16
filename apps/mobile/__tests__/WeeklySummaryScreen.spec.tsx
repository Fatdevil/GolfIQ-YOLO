import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { Share } from 'react-native';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { fetchWeeklySummary } from '@app/api/weeklySummaryClient';
import WeeklySummaryScreen from '@app/screens/WeeklySummaryScreen';

vi.mock('@app/api/weeklySummaryClient', () => ({
  fetchWeeklySummary: vi.fn(),
}));

const mockFetchWeeklySummary = fetchWeeklySummary as unknown as Mock;

describe('WeeklySummaryScreen', () => {
  it('shows friendly empty state and CTAs when no rounds are present', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-01-07T00:00:00Z',
      roundsPlayed: 0,
      holesPlayed: 0,
      focusHints: [],
    });

    const navigation = { navigate: vi.fn() } as any;
    const { findByText, getByTestId } = render(
      <WeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    expect(await findByText(/No rounds yet this week/i)).toBeTruthy();
    fireEvent.click(getByTestId('weekly-empty-start-round'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundStart');
  });

  it('renders highlight, focus hints, and shares recap', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-01-07T00:00:00Z',
      roundsPlayed: 2,
      holesPlayed: 36,
      highlight: { label: 'Best round', value: '82 (+10)', roundId: 'r1' },
      focusHints: ['Work on approach tempo'],
    });

    const shareSpy = vi.spyOn(Share, 'share').mockResolvedValue({} as any);

    const { getByTestId, getByText } = render(
      <WeeklySummaryScreen
        navigation={{ navigate: vi.fn() } as any}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    await waitFor(() => expect(getByTestId('weekly-headline')).toBeTruthy());
    expect(getByText(/82 \(\+10\)/)).toBeTruthy();
    expect(getByText(/Work on approach tempo/)).toBeTruthy();

    fireEvent.click(getByTestId('weekly-share'));
    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    expect(shareSpy.mock.calls[0][0].message).toContain('GolfIQ Weekly Recap');
  });
});
