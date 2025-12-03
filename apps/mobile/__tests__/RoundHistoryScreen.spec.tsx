import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import RoundHistoryScreen from '@app/screens/RoundHistoryScreen';
import { listRoundSummaries, listRounds } from '@app/api/roundClient';

vi.mock('@app/api/roundClient');

const mockListRounds = listRounds as unknown as Mock;
const mockListSummaries = listRoundSummaries as unknown as Mock;

describe('RoundHistoryScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a list of rounds and navigates to summary', async () => {
    mockListRounds.mockResolvedValue([
      {
        id: 'r1',
        courseName: 'Pebble Beach',
        holes: 18,
        startedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'r2',
        courseName: 'Spyglass',
        holes: 18,
        startedAt: '2024-02-01T00:00:00Z',
      },
    ]);
    mockListSummaries.mockResolvedValue([
      {
        roundId: 'r1',
        totalStrokes: 80,
        totalPar: 72,
        totalToPar: 8,
        totalPutts: 32,
        fairwaysHit: 7,
        fairwaysTotal: 14,
        girCount: 6,
        holesPlayed: 18,
      },
      {
        roundId: 'r2',
        totalStrokes: 75,
        totalPar: 72,
        totalToPar: 3,
        totalPutts: 30,
        fairwaysHit: 9,
        fairwaysTotal: 14,
        girCount: 8,
        holesPlayed: 18,
      },
    ]);

    const navigation = { navigate: vi.fn() } as any;
    const { getAllByTestId, getByText } = render(
      <RoundHistoryScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getAllByTestId('round-history-item').length).toBe(2));
    expect(getByText('Spyglass')).toBeTruthy();
    expect(getByText('75 (+3)')).toBeTruthy();

    fireEvent.click(getAllByTestId('round-history-item')[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('RoundSummary', { roundId: 'r2' });
  });

  it('shows empty state when no rounds are present', async () => {
    mockListRounds.mockResolvedValue([]);
    mockListSummaries.mockResolvedValue([]);

    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByText } = render(
      <RoundHistoryScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockListRounds).toHaveBeenCalled());
    expect(getByText(/No rounds logged yet/)).toBeTruthy();

    fireEvent.click(getByTestId('round-history-empty-cta'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundStart');
  });
});
