import { describe, expect, it } from 'vitest';

import {
  buildWeeklyPracticeHistory,
  PRACTICE_WEEK_WINDOW_DAYS,
  type PracticeMissionHistoryEntry,
} from '../practice/practiceHistory';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeEntry(id: string, daysAgo: number, status: 'completed' | 'abandoned' = 'completed'): PracticeMissionHistoryEntry {
  const now = new Date('2024-02-21T12:00:00Z').getTime();
  const startedAt = new Date(now - daysAgo * DAY_MS).toISOString();

  return {
    id,
    missionId: 'mission-' + id,
    startedAt,
    status,
    targetClubs: ['7i'],
    completedSampleCount: 10,
  };
}

describe('buildWeeklyPracticeHistory', () => {
  const now = new Date('2024-02-21T12:00:00Z');

  it('returns per-week summaries with goal status and targets', () => {
    const history: PracticeMissionHistoryEntry[] = [
      makeEntry('current-1', 1),
      makeEntry('current-2', 3),
      makeEntry('previous-1', PRACTICE_WEEK_WINDOW_DAYS + 1),
      makeEntry('previous-2', PRACTICE_WEEK_WINDOW_DAYS + 3),
      makeEntry('earlier', PRACTICE_WEEK_WINDOW_DAYS * 2 + 1),
      makeEntry('abandoned', 2, 'abandoned'),
    ];

    const summaries = buildWeeklyPracticeHistory({
      history,
      now,
      weeks: 4,
      settings: { targetMissionsPerWeek: 2 },
    });

    expect(summaries).toHaveLength(3);
    expect(summaries[0]).toMatchObject({
      completedCount: 2,
      target: 2,
      goalReached: true,
    });
    expect(summaries[1]).toMatchObject({
      completedCount: 2,
      target: 2,
      goalReached: true,
    });
    expect(summaries[2]).toMatchObject({
      completedCount: 1,
      target: 2,
      goalReached: false,
    });
  });

  it('falls back to default targets and respects empty history', () => {
    const empty = buildWeeklyPracticeHistory({ history: [], now });
    expect(empty).toEqual([]);

    const single = buildWeeklyPracticeHistory({
      history: [makeEntry('single', 0)],
      now,
      weeks: 2,
    });

    expect(single[0].target).toBeGreaterThan(0);
    expect(single[0].goalReached).toBe(false);
  });
});
