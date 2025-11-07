import { describe, it, expect } from 'vitest';
import { aggregateScoreRows } from '@shared/events/scoring';
import type { ScoreRow } from '@shared/events/types';

function makeRow(userId: string, hole: number, gross: number, net?: number): ScoreRow {
  return {
    event_id: 'event',
    user_id: userId,
    hole_no: hole,
    gross,
    net: typeof net === 'number' ? net : Number.NaN,
    to_par: gross - 4,
    par: 4,
    ts: `2024-01-${String(10 + hole).padStart(2, '0')}T00:00:00.000Z`,
  };
}

describe('events scoring – WHS fallback activation', () => {
  it('does not mark netFromRows when net is missing or equals gross', () => {
    const rows = [
      makeRow('a', 1, 5),
      makeRow('a', 2, 4, 4),
    ];
    const agg = aggregateScoreRows(rows);
    const entry = agg.get('a');
    expect(entry?.netFromRows).toBe(false);
  });

  it('marks netFromRows when explicit net differs from gross', () => {
    const rows = [makeRow('a', 1, 5, 4)];
    const agg = aggregateScoreRows(rows);
    const entry = agg.get('a');
    expect(entry?.netFromRows).toBe(true);
  });
});
