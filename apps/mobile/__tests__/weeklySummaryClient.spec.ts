import { describe, expect, it } from 'vitest';

import { aggregateWeeklySummary } from '@app/api/weeklySummaryClient';

const now = new Date('2024-02-08T12:00:00Z');

describe('weeklySummaryClient', () => {
  it('filters rounds to the last 7 days and aggregates holes', () => {
    const rounds = [
      { id: 'r1', holes: 18, startedAt: '2024-02-07T10:00:00Z', endedAt: '2024-02-07T12:00:00Z' },
      { id: 'r2', holes: 9, startedAt: '2024-01-25T10:00:00Z', endedAt: '2024-01-25T12:00:00Z' },
    ] as any;
    const summaries = [
      { roundId: 'r1', totalStrokes: 82, totalToPar: 10, holesPlayed: 18 },
      { roundId: 'r2', totalStrokes: 40, holesPlayed: 9 },
    ] as any;

    const summary = aggregateWeeklySummary(rounds, summaries, 7, now);

    expect(summary.roundsPlayed).toBe(1);
    expect(summary.holesPlayed).toBe(18);
    expect(summary.highlight?.roundId).toBe('r1');
  });

  it('aligns aggregation window with displayed start date', () => {
    const rounds = [
      { id: 'r_old', holes: 18, startedAt: '2024-02-01T10:00:00Z', endedAt: '2024-02-01T12:00:00Z' },
      { id: 'r_recent', holes: 9, startedAt: '2024-02-02T10:00:00Z', endedAt: '2024-02-02T12:00:00Z' },
    ] as any;
    const summaries = [
      { roundId: 'r_old', totalStrokes: 70, totalToPar: -2, holesPlayed: 18, fairwaysHit: 8, fairwaysTotal: 10 },
      { roundId: 'r_recent', totalStrokes: 90, totalToPar: 8, holesPlayed: 9, fairwaysHit: 0, fairwaysTotal: 6 },
    ] as any;

    const summary = aggregateWeeklySummary(rounds, summaries, 7, now);

    expect(summary.startDate).toBe(new Date('2024-02-02T12:00:00.000Z').toISOString());
    expect(summary.roundsPlayed).toBe(1);
    expect(summary.holesPlayed).toBe(9);
    expect(summary.highlight?.roundId).toBe('r_recent');
    expect(summary.focusCategory).toBe('driving');
    expect(summary.focusHints[0].text).toContain('fairways');
  });
});
