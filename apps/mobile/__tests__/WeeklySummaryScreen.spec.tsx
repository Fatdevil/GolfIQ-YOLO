import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { Share } from 'react-native';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { fetchWeeklySummary } from '@app/api/weeklySummaryClient';
import WeeklySummaryScreen from '@app/screens/WeeklySummaryScreen';
import { addDrillToPlan, focusHintToDrills } from '@app/practice/focusHintToDrills';

vi.mock('@app/api/weeklySummaryClient', () => ({
  fetchWeeklySummary: vi.fn(),
}));
vi.mock('@app/practice/focusHintToDrills', () => ({
  focusHintToDrills: vi.fn(),
  addDrillToPlan: vi.fn(),
}));

const mockFetchWeeklySummary = fetchWeeklySummary as unknown as Mock;
const mockAddToPlan = addDrillToPlan as unknown as Mock;
const mockFocusToDrills = focusHintToDrills as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  mockFocusToDrills.mockReturnValue([]);
});

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
      focusHints: [{ id: 'hint-1', text: 'Work on approach tempo', category: 'approach' }],
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

  it('adds mapped drills to the weekly practice plan', async () => {
    mockFetchWeeklySummary.mockResolvedValue({
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-01-07T00:00:00Z',
      roundsPlayed: 1,
      holesPlayed: 18,
      focusHints: [{ id: 'hint-putting', text: 'Cut down on 3-putts', category: 'putting' }],
    });
    mockFocusToDrills.mockReturnValue([
      {
        id: 'putting-lag-ladder',
        category: 'putting',
        titleKey: 'practiceDrills.putting_lag_title',
        descriptionKey: 'practiceDrills.putting_lag_desc',
        durationMin: 12,
        tags: [],
      },
    ]);
    mockAddToPlan.mockResolvedValue({ weekStartISO: '2024-01-01', items: [] });

    const navigation = { navigate: vi.fn() } as any;
    const { findByTestId, findByText, getByText } = render(
      <WeeklySummaryScreen
        navigation={navigation}
        route={{ key: 'WeeklySummary', name: 'WeeklySummary', params: undefined } as any}
      />,
    );

    await findByTestId('weekly-hint-hint-putting');
    fireEvent.click(getByText(/Add to plan/i));

    await waitFor(() => expect(mockAddToPlan).toHaveBeenCalledWith('putting-lag-ladder', {
      type: 'weekly_focus_hint',
      hintId: 'hint-putting',
    }));

    expect(await findByText(/Added to this week/)).toBeTruthy();
  });
});
