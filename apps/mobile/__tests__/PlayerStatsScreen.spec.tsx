import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { listRoundSummaries } from '@app/api/roundClient';
import { fetchPlayerCategoryStats } from '@app/api/statsClient';
import PlayerStatsScreen from '@app/screens/PlayerStatsScreen';

vi.mock('@app/api/roundClient');
vi.mock('@app/api/statsClient');

const mockListSummaries = listRoundSummaries as unknown as Mock;
const mockFetchCategoryStats = fetchPlayerCategoryStats as unknown as Mock;

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
    mockFetchCategoryStats.mockResolvedValue({
      playerId: 'p1',
      roundsCount: 1,
      teeShots: 18,
      approachShots: 30,
      shortGameShots: 8,
      putts: 31,
      penalties: 2,
      avgTeeShotsPerRound: 18,
      avgApproachShotsPerRound: 30,
      avgShortGameShotsPerRound: 8,
      avgPuttsPerRound: 31,
      teePct: 25,
      approachPct: 40,
      shortGamePct: 10,
      puttingPct: 25,
    });

    const navigation = { navigate: vi.fn() } as any;
    const { getByText, getByTestId } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCategoryStats).toHaveBeenCalled());
    expect(getByText(/Avg score/)).toBeTruthy();
    expect(getByText(/Rounds played/)).toBeTruthy();
    expect(getByTestId('player-stats-view-categories')).toBeTruthy();

    fireEvent.click(getByTestId('player-stats-view-rounds'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });

  it('shows empty state when there are no rounds', async () => {
    mockListSummaries.mockResolvedValue([]);
    mockFetchCategoryStats.mockResolvedValue({
      playerId: 'p1',
      roundsCount: 0,
      teeShots: 0,
      approachShots: 0,
      shortGameShots: 0,
      putts: 0,
      penalties: 0,
    });

    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByText } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(mockFetchCategoryStats).toHaveBeenCalled());
    expect(getByText(/No stats yet/)).toBeTruthy();

    fireEvent.click(getByTestId('player-stats-empty-cta'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });
});
