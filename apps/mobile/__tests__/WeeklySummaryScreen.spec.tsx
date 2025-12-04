import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Share } from 'react-native';

import WeeklySummaryScreen from '@app/screens/WeeklySummaryScreen';
import { fetchWeeklySummary } from '@app/api/weeklySummary';
import { createWeeklyShareLink } from '@app/api/shareClient';

vi.mock('@app/api/weeklySummary', () => ({
  fetchWeeklySummary: vi.fn(),
}));
vi.mock('@app/api/shareClient', () => ({
  createWeeklyShareLink: vi.fn(),
}));

const mockFetchWeeklySummary = fetchWeeklySummary as unknown as Mock;
const mockCreateWeeklyShareLink = createWeeklyShareLink as unknown as Mock;

describe('WeeklySummaryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateWeeklyShareLink.mockResolvedValue({ url: 'https://golfiq.app/s/week1' });
  });

  it('renders the weekly summary with categories and hints', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      period: { from: '2024-12-01', to: '2024-12-07', roundCount: 3 },
      headline: { text: 'Solid week!', emoji: '🔥' },
      coreStats: {
        avgScore: 82.5,
        bestScore: 79,
        worstScore: 88,
        avgToPar: '+10',
        holesPlayed: 54,
      },
      categories: {
        driving: { grade: 'B', trend: 'up', note: '60% fairways hit' },
        approach: { grade: 'B', trend: 'flat', note: '50% greens' },
        short_game: { grade: 'C', trend: 'up', note: '1.1 recovery shots per hole' },
        putting: { grade: 'A', trend: 'up', note: '1.6 putts per hole' },
      },
      focusHints: ['Keep working on approach play'],
      strokesGained: {
        total: 0.9,
        categories: {
          driving: { value: 0.2, grade: 'B', label: 'Driving' },
          approach: { value: 0.3, grade: 'B', label: 'Approach' },
          short_game: { value: 0.1, grade: 'C', label: 'Short Game' },
          putting: { value: 0.3, grade: 'B', label: 'Putting' },
        },
      },
    });

    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByText } = render(
      <WeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    await waitFor(() => expect(getByTestId('weekly-headline')).toBeTruthy());
    expect(getByText('Avg score')).toBeTruthy();
    expect(getByText('82.5')).toBeTruthy();
    expect(getByTestId('weekly-category-driving')).toBeTruthy();
    expect(getByText(/Keep working on approach play/)).toBeTruthy();
    expect(getByTestId('weekly-sg-driving')).toBeTruthy();
    expect(getByText('+0.2 B')).toBeTruthy();

    fireEvent.click(getByTestId('weekly-summary-history'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });

  it('shows a friendly empty state when there are no rounds', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      period: { from: '2024-12-01', to: '2024-12-07', roundCount: 0 },
      headline: { text: 'Play a round', emoji: '⛳' },
      coreStats: {
        avgScore: null,
        bestScore: null,
        worstScore: null,
        avgToPar: null,
        holesPlayed: null,
      },
      categories: {},
      focusHints: [],
    });

    const navigation = { navigate: vi.fn() } as any;
    const { findByText, queryByText } = render(
      <WeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    expect(await findByText(/Not enough data yet/)).toBeTruthy();
    expect(queryByText(/Strokes Gained/)).toBeNull();
  });

  it('shares weekly summary with a shortlink', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      period: { from: '2024-12-01', to: '2024-12-07', roundCount: 2 },
      headline: { text: 'Solid week!', emoji: '🔥' },
      coreStats: { avgScore: 80, bestScore: 78, worstScore: 85, avgToPar: '+6', holesPlayed: 36 },
      categories: {
        driving: { grade: 'A', trend: 'up', note: 'Fairways 70%' },
      },
      focusHints: [],
    });

    mockCreateWeeklyShareLink.mockResolvedValue({ url: 'https://golfiq.app/s/w-share' });
    const shareSpy = vi.spyOn(Share, 'share').mockResolvedValue({} as any);

    const { getByTestId, getByText } = render(
      <WeeklySummaryScreen
        navigation={{} as any}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    await waitFor(() => expect(getByTestId('weekly-headline')).toBeTruthy());
    fireEvent.click(getByTestId('share-weekly'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    expect(shareSpy.mock.calls[0][0].message).toContain('https://golfiq.app/s/w-share');
    expect(getByText('Share this week')).toBeTruthy();
  });

  it('falls back gracefully when share link fails', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      period: { from: '2024-12-01', to: '2024-12-07', roundCount: 1 },
      headline: { text: 'Solid week!', emoji: '🔥' },
      coreStats: { avgScore: 80, bestScore: 78, worstScore: 85, avgToPar: '+6', holesPlayed: 18 },
      categories: {},
      focusHints: [],
    });

    mockCreateWeeklyShareLink.mockRejectedValue(new Error('nope'));
    const shareSpy = vi.spyOn(Share, 'share').mockResolvedValue({} as any);

    const { getByTestId } = render(
      <WeeklySummaryScreen
        navigation={{} as any}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    await waitFor(() => expect(getByTestId('weekly-headline')).toBeTruthy());
    fireEvent.click(getByTestId('share-weekly'));

    await waitFor(() => expect(shareSpy).toHaveBeenCalled());
    expect(shareSpy.mock.calls[0][0].message).not.toContain('http');
  });
});
