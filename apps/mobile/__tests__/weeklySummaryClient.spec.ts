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
});
