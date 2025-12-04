import { describe, expect, it, vi, type Mock } from 'vitest';

import { apiFetch } from './client';
import { fetchPlayerCategoryStats } from './statsClient';
import { fetchWeeklySummary } from './weeklySummary';

vi.mock('./client', () => ({
  apiFetch: vi.fn(),
}));

describe('statsClient', () => {
  it('fetches player category stats from the API', async () => {
    const payload = {
      playerId: 'player-1',
      roundsCount: 3,
      teeShots: 54,
      approachShots: 70,
      shortGameShots: 20,
      putts: 90,
      penalties: 4,
      avgTeeShotsPerRound: 18,
      avgApproachShotsPerRound: 23.3,
      avgShortGameShotsPerRound: 6.7,
      avgPuttsPerRound: 30,
      teePct: 30,
      approachPct: 35,
      shortGamePct: 10,
      puttingPct: 25,
    };
    const mockApiFetch = apiFetch as unknown as Mock;
    mockApiFetch.mockResolvedValue(payload);

    const result = await fetchPlayerCategoryStats();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/stats/player/categories');
    expect(result).toEqual(payload);
  });

  it('fetches the weekly summary', async () => {
    const payload = {
      period: { from: '2024-01-01', to: '2024-01-07', roundCount: 3 },
      headline: { text: 'Great week', emoji: '🔥' },
      coreStats: {
        avgScore: 80,
        bestScore: 75,
        worstScore: 85,
        avgToPar: '+8',
        holesPlayed: 54,
      },
      categories: {},
      focusHints: ['Keep driving well'],
    };

    const mockApiFetch = apiFetch as unknown as Mock;
    mockApiFetch.mockResolvedValue(payload);

    const result = await fetchWeeklySummary();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/player/summary/weekly');
    expect(result).toEqual(payload);
  });
});
