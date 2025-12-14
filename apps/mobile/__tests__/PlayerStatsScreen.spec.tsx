import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { fetchRoundRecap, listRoundSummaries } from '@app/api/roundClient';
import { fetchPlayerCategoryStats } from '@app/api/statsClient';
import PlayerStatsScreen from '@app/screens/PlayerStatsScreen';
import { safeEmit } from '@app/telemetry';
import {
  SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT,
  SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT,
} from '@shared/sgLight/analytics';

vi.mock('@app/api/roundClient');
vi.mock('@app/api/statsClient');
vi.mock('@app/telemetry', () => ({ safeEmit: vi.fn() }));

const mockListSummaries = listRoundSummaries as unknown as Mock;
const mockFetchRecap = fetchRoundRecap as unknown as Mock;
const mockFetchCategoryStats = fetchPlayerCategoryStats as unknown as Mock;
const mockSafeEmit = safeEmit as unknown as Mock;

describe('PlayerStatsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchRecap.mockResolvedValue({ strokesGainedLight: null, roundId: 'default', date: '2024-01-01' });
  });

  it('renders stats from summaries and categories when both requests succeed', async () => {
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
    const { getByText, getByTestId, getAllByText } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByText(/Avg score/)).toBeTruthy());
    expect(getByText(/Rounds played/)).toBeTruthy();
    await waitFor(() => expect(mockFetchCategoryStats).toHaveBeenCalled());
    expect(getByText(/Shot categories/)).toBeTruthy();
    expect(getAllByText(/shots\/round/).length).toBeGreaterThan(0);
    expect(getByTestId('player-stats-view-categories')).toBeTruthy();

    fireEvent.click(getByTestId('player-stats-view-rounds'));
    expect(navigation.navigate).toHaveBeenCalledWith('RoundHistory');
  });

  it('shows base stats even if category stats fail', async () => {
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
    mockFetchCategoryStats.mockRejectedValue(new Error('500'));

    const navigation = { navigate: vi.fn() } as any;
    const { getByText, queryByText } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByText(/Avg score/)).toBeTruthy());

    expect(queryByText(/No stats yet/)).toBeNull();
    expect(getByText(/Category stats are temporarily unavailable/)).toBeTruthy();
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

  it('renders SG Light trend and practice CTA when history is available', async () => {
    mockListSummaries.mockResolvedValue([
      { roundId: 'r1', totalStrokes: 72, holesPlayed: 18 },
      { roundId: 'r2', totalStrokes: 70, holesPlayed: 18 },
    ]);
    mockFetchCategoryStats.mockResolvedValue({
      playerId: 'p1',
      roundsCount: 2,
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
    mockFetchRecap
      .mockResolvedValueOnce({
        roundId: 'r1',
        date: '2024-03-01',
        strokesGainedLight: {
          totalDelta: -0.5,
          byCategory: [
            { category: 'tee', shots: 10, delta: -0.6, confidence: 0.9 },
            { category: 'approach', shots: 10, delta: -0.2, confidence: 0.9 },
            { category: 'short_game', shots: 6, delta: 0.1, confidence: 0.9 },
            { category: 'putting', shots: 2, delta: 0.2, confidence: 0.9 },
          ],
          focusCategory: 'tee',
        },
      })
      .mockResolvedValueOnce({
        roundId: 'r2',
        date: '2024-02-20',
        strokesGainedLight: {
          totalDelta: -0.2,
          byCategory: [
            { category: 'tee', shots: 12, delta: -0.2, confidence: 0.9 },
            { category: 'approach', shots: 8, delta: -0.1, confidence: 0.9 },
            { category: 'short_game', shots: 4, delta: 0.1, confidence: 0.9 },
            { category: 'putting', shots: 3, delta: 0.1, confidence: 0.9 },
          ],
          focusCategory: 'tee',
        },
      });

    const navigation = { navigate: vi.fn() } as any;
    const { getByTestId, getByText } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('player-stats-sg-trend-headline')).toBeTruthy());
    expect(getByText(/Performance trend/)).toBeTruthy();
    expect(mockSafeEmit).toHaveBeenCalledWith(SG_LIGHT_PRACTICE_FOCUS_ENTRY_SHOWN_EVENT, {
      focusCategory: 'tee',
      surface: 'mobile_stats_sg_light_trend',
    });

    fireEvent.click(getByTestId('player-stats-sg-trend-cta'));
    expect(navigation.navigate).toHaveBeenCalledWith('PracticeMissions', {
      source: 'mobile_stats_sg_light_trend',
      practiceRecommendationSource: 'mobile_stats_sg_light_trend',
      strokesGainedLightFocusCategory: 'tee',
    });
    expect(mockSafeEmit).toHaveBeenCalledWith(SG_LIGHT_PRACTICE_FOCUS_ENTRY_CLICKED_EVENT, {
      focusCategory: 'tee',
      surface: 'mobile_stats_sg_light_trend',
    });
  });

  it('skips SG Light recap fetches when the feature flag is disabled', async () => {
    mockListSummaries.mockResolvedValue([
      { roundId: 'r1', totalStrokes: 72, holesPlayed: 18 },
      { roundId: 'r2', totalStrokes: 70, holesPlayed: 18 },
    ]);
    mockFetchCategoryStats.mockResolvedValue({
      playerId: 'p1',
      roundsCount: 2,
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
    vi.stubEnv?.('EXPO_PUBLIC_FEATURE_SG_LIGHT', '0');

    const navigation = { navigate: vi.fn() } as any;
    render(<PlayerStatsScreen navigation={navigation} route={undefined as any} />);

    await waitFor(() => expect(mockFetchRecap).not.toHaveBeenCalled());

    vi.unstubAllEnvs?.();
  });

  it('opens SG Light explainer from player stats', async () => {
    mockListSummaries.mockResolvedValue([
      {
        roundId: 'r1',
        totalStrokes: 72,
        totalPar: 72,
        totalToPar: 0,
        totalPutts: 30,
        fairwaysHit: 10,
        fairwaysTotal: 14,
        girCount: 10,
        holesPlayed: 18,
      },
    ]);
    mockFetchRecap.mockResolvedValue({
      roundId: 'r1',
      date: '2024-01-02',
      strokesGainedLight: {
        totalDelta: 0.5,
        byCategory: [
          { category: 'tee', shots: 10, delta: 0.2, confidence: 0.8 },
          { category: 'approach', shots: 12, delta: 0.3, confidence: 0.8 },
        ],
        focusCategory: 'approach',
      },
    });
    mockFetchCategoryStats.mockResolvedValue({ roundsCount: 0 } as any);

    const { getByTestId, getByText } = render(
      <PlayerStatsScreen navigation={{ navigate: vi.fn() } as any} route={undefined as any} />,
    );

    await waitFor(() => expect(getByTestId('player-stats-sg-trend-card')).toBeTruthy());
    fireEvent.click(getByTestId('open-sg-light-explainer'));

    expect(getByText('What is SG Light?')).toBeTruthy();
    expect(mockSafeEmit).toHaveBeenCalledWith('sg_light_explainer_opened', { surface: 'player_stats' });
  });

  it('shows placeholder when SG Light history is insufficient', async () => {
    mockListSummaries.mockResolvedValue([{ roundId: 'r1', totalStrokes: 72, holesPlayed: 18 }]);
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
    mockFetchRecap.mockResolvedValue({ roundId: 'r1', date: '2024-03-01', strokesGainedLight: null });

    const navigation = { navigate: vi.fn() } as any;
    const { findByText, queryByTestId } = render(
      <PlayerStatsScreen navigation={navigation} route={undefined as any} />,
    );

    expect(await findByText(/Not enough strokes gained data yet/)).toBeTruthy();
    expect(queryByTestId('player-stats-sg-trend-cta')).toBeNull();
  });
});
