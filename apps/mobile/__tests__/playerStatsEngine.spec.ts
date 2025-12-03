import { describe, expect, it } from 'vitest';

import { computePlayerStats } from '@app/stats/playerStatsEngine';
import type { RoundSummary } from '@app/api/roundClient';

const baseSummary: RoundSummary = {
  roundId: 'r1',
  totalStrokes: 72,
  totalPar: 70,
  totalToPar: 2,
  totalPutts: 30,
  fairwaysHit: 8,
  fairwaysTotal: 14,
  girCount: 9,
  holesPlayed: 18,
};

describe('computePlayerStats', () => {
  it('computes averages and percentages for valid rounds', () => {
    const summaries: RoundSummary[] = [
      baseSummary,
      {
        ...baseSummary,
        roundId: 'r2',
        totalStrokes: 75,
        totalPar: 72,
        totalToPar: 3,
        totalPutts: 32,
        fairwaysHit: 9,
        fairwaysTotal: 14,
        girCount: 8,
      },
    ];

    const stats = computePlayerStats(summaries);
    expect(stats.roundsPlayed).toBe(2);
    expect(stats.avgScore).toBeCloseTo((72 + 75) / 2);
    expect(stats.avgToPar).toBeCloseTo(2.5);
    expect(stats.avgPutts).toBeCloseTo(31);
    expect(stats.firPct).toBeCloseTo(((8 + 9) / (14 + 14)) * 100);
    expect(stats.girPct).toBeCloseTo(((9 + 8) / (18 + 18)) * 100);
  });

  it('handles missing values gracefully', () => {
    const summaries: RoundSummary[] = [
      { roundId: 'r1', holesPlayed: 18 },
      { ...baseSummary, roundId: 'r2', totalPutts: null },
    ];

    const stats = computePlayerStats(summaries);
    expect(stats.roundsPlayed).toBe(2);
    expect(stats.avgScore).toBeCloseTo(72);
    expect(stats.avgToPar).toBeCloseTo(2);
    expect(stats.avgPutts).toBeNull();
  });

  it('returns null percentages when no fairway or gir data', () => {
    const summaries: RoundSummary[] = [
      { ...baseSummary, fairwaysHit: null, fairwaysTotal: null, girCount: null },
    ];

    const stats = computePlayerStats(summaries);
    expect(stats.firPct).toBeNull();
    expect(stats.girPct).toBeNull();
  });
});
