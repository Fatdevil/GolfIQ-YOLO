import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import PlayerStatsScreen from '@app/screens/PlayerStatsScreen';
import { listRoundSummaries } from '@app/api/roundClient';

vi.mock('@app/api/roundClient');

const mockListSummaries = listRoundSummaries as unknown as Mock;

describe('PlayerStatsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stats from summaries', async () => {
    mockListSummaries.mockResolvedValue([
      {
        roundId: 'r1',
        totalStrokes: 72,
        totalPar: 70,
        totalToPar: 2,
        totalPutts: 31,
        fairwaysHit: 8,
        fairwaysTotal: 14,
        girCount: 9,
        holesPlayed: 18,
      },
    ]);

    const navigation = { navigate: vi.fn() } as any;
    const { getByText, getByTestId } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockListSummaries).toHaveBeenCalled());
    expect(getByText(/Avg score/)).toBeTruthy();
    expect(getByText(/Rounds played/)).toBeTruthy();

    fireEvent.click(getByTestId('player-stats-view-rounds'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });

  it('shows empty state when there are no rounds', async () => {
    mockListSummaries.mockResolvedValue([]);

    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByText } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockListSummaries).toHaveBeenCalled());
    expect(getByText(/No stats yet/)).toBeTruthy();

    fireEvent.click(getByTestId('player-stats-empty-cta'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });
});
