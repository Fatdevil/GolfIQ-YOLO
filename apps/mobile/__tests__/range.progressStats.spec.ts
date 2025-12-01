import { describe, expect, it } from 'vitest';

import { computeRangeProgressStats } from '@app/range/rangeProgressStats';
import type { RangeHistoryEntry } from '@app/range/rangeHistoryStorage';

type EntryOverrides = Partial<Omit<RangeHistoryEntry, 'summary'>> & {
  summary?: Partial<RangeHistoryEntry['summary']>;
};

function createEntry(overrides: EntryOverrides = {}): RangeHistoryEntry {
  const now = new Date();
  return {
    id: overrides.id ?? `entry-${Math.random()}`,
    savedAt: overrides.savedAt ?? new Date(now.getTime() - 1000).toISOString(),
    summary: {
      id: overrides.summary?.id ?? 'summary-1',
      startedAt: overrides.summary?.startedAt ?? now.toISOString(),
      finishedAt: overrides.summary?.finishedAt ?? now.toISOString(),
      club: overrides.summary?.club ?? '7i',
      shotCount: overrides.summary?.shotCount ?? 12,
      contactPct: overrides.summary?.contactPct,
      avgCarryM: overrides.summary?.avgCarryM ?? null,
      tendency: overrides.summary?.tendency ?? 'straight',
    },
  };
}

describe('computeRangeProgressStats', () => {
  it('handles empty history defensively', () => {
    const stats = computeRangeProgressStats([]);

    expect(stats.sessionCount).toBe(0);
    expect(stats.totalRecordedShots).toBe(0);
    expect(stats.mostRecordedClubs).toEqual([]);
    expect(stats.recentSampleSize).toEqual({ sessions: 0, shots: 0 });
    expect(stats.recentContactPct).toBeUndefined();
    expect(stats.recentLeftRightBias).toBeUndefined();
  });

  it('keeps quality metrics undefined for very small sample sizes', () => {
    const history: RangeHistoryEntry[] = [
      createEntry({ id: '1', summary: { shotCount: 8, club: '7i', tendency: 'left' } }),
      createEntry({ id: '2', summary: { shotCount: 9, club: 'PW', tendency: 'right' } }),
    ];

    const stats = computeRangeProgressStats(history);

    expect(stats.recentSampleSize.sessions).toBe(2);
    expect(stats.recentSampleSize.shots).toBe(17);
    expect(stats.recentContactPct).toBeUndefined();
    expect(stats.recentLeftRightBias).toBeUndefined();
  });

  it('requires enough shots before surfacing quality metrics', () => {
    const history: RangeHistoryEntry[] = [
      createEntry({ id: '1', summary: { shotCount: 5, club: '7i', tendency: 'left' } }),
      createEntry({ id: '2', summary: { shotCount: 8, club: '7i', tendency: 'left' } }),
      createEntry({ id: '3', summary: { shotCount: 6, club: '7i', tendency: 'right' } }),
      createEntry({ id: '4', summary: { shotCount: 7, club: '7i', tendency: 'straight' } }),
    ];

    const stats = computeRangeProgressStats(history);

    expect(stats.recentSampleSize.sessions).toBe(4);
    expect(stats.recentSampleSize.shots).toBe(26);
    expect(stats.recentContactPct).toBeUndefined();
    expect(stats.recentLeftRightBias).toBeUndefined();
  });

  it('computes aggregated stats with enough recent data', () => {
    const history: RangeHistoryEntry[] = [
      createEntry({
        id: 'latest',
        savedAt: '2024-08-05T10:00:00.000Z',
        summary: { shotCount: 15, club: '7i', contactPct: 70, tendency: 'left' },
      }),
      createEntry({
        id: 'mid',
        savedAt: '2024-08-03T10:00:00.000Z',
        summary: { shotCount: 15, club: '7i', contactPct: 80, tendency: 'right' },
      }),
      createEntry({
        id: 'older',
        savedAt: '2024-08-01T10:00:00.000Z',
        summary: { shotCount: 20, club: 'Driver', contactPct: 90, tendency: 'straight' },
      }),
      createEntry({
        id: 'oldest',
        savedAt: '2024-07-28T10:00:00.000Z',
        summary: { shotCount: 10, club: 'PW', contactPct: 60, tendency: 'left' },
      }),
      createEntry({
        id: 'very-old',
        savedAt: '2024-07-20T10:00:00.000Z',
        summary: { shotCount: 12, club: 'PW', contactPct: 75, tendency: 'right' },
      }),
    ];

    const stats = computeRangeProgressStats(history);

    expect(stats.sessionCount).toBe(5);
    expect(stats.totalRecordedShots).toBe(72);
    expect(stats.firstSessionDate).toBe('2024-07-20T10:00:00.000Z');
    expect(stats.lastSessionDate).toBe('2024-08-05T10:00:00.000Z');
    expect(stats.mostRecordedClubs[0]).toEqual({ club: '7i', shotCount: 30 });
    expect(stats.mostRecordedClubs.length).toBe(3);

    expect(stats.recentSampleSize).toEqual({ sessions: 5, shots: 72 });
    expect(stats.recentContactPct).toBe(75);
    expect(stats.recentLeftRightBias).toBe('balanced');
  });
});
