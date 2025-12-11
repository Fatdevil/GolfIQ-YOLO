import { describe, expect, it } from 'vitest';

import { buildPracticeReadinessSummary } from '../practice/practiceReadiness';
import { PRACTICE_WEEK_WINDOW_DAYS, type PracticeMissionHistoryEntry } from '../practice/practiceHistory';

const DAY_MS = 24 * 60 * 60 * 1000;

function makeEntry(
  id: string,
  daysAgo: number,
  samples: number,
  status: 'completed' | 'abandoned' = 'completed',
): PracticeMissionHistoryEntry {
  const now = new Date('2024-02-21T12:00:00Z').getTime();
  const startedAt = new Date(now - daysAgo * DAY_MS).toISOString();

  return {
    id,
    missionId: 'mission-' + id,
    startedAt,
    status,
    targetClubs: ['7i'],
    completedSampleCount: samples,
  };
}

describe('buildPracticeReadinessSummary', () => {
  const now = new Date('2024-02-21T12:00:00Z');

  it('returns sessions, shots, and goal progress for the current week', () => {
    const history: PracticeMissionHistoryEntry[] = [
      makeEntry('recent-1', 1, 30),
      makeEntry('recent-2', 3, 20),
      makeEntry('older', PRACTICE_WEEK_WINDOW_DAYS + 1, 15),
      makeEntry('abandoned', 0, 10, 'abandoned'),
    ];

    const summary = buildPracticeReadinessSummary({
      history,
      now,
      goalSettings: { targetMissionsPerWeek: 2 },
    });

    expect(summary.sessionsCompleted).toBe(2);
    expect(summary.shotsCompleted).toBe(50);
    expect(summary.goalTarget).toBe(2);
    expect(summary.goalProgress).toBe(2);
    expect(summary.goalReached).toBe(true);
    expect(summary.windowDays).toBe(PRACTICE_WEEK_WINDOW_DAYS);
  });

  it('handles missing goals gracefully', () => {
    const summary = buildPracticeReadinessSummary({
      history: [],
      now,
      goalSettings: null,
    });

    expect(summary.sessionsCompleted).toBe(0);
    expect(summary.shotsCompleted).toBe(0);
    expect(summary.goalTarget).toBeNull();
    expect(summary.goalProgress).toBe(0);
    expect(summary.goalReached).toBe(false);
  });

  it('expands the window when multiple weeks are requested', () => {
    const history: PracticeMissionHistoryEntry[] = [
      makeEntry('two-weeks-ago', PRACTICE_WEEK_WINDOW_DAYS + 2, 12),
      makeEntry('current', 0, 18),
    ];

    const summary = buildPracticeReadinessSummary({
      history,
      now,
      weeks: 2,
    });

    expect(summary.sessionsCompleted).toBe(2);
    expect(summary.shotsCompleted).toBe(30);
    expect(summary.windowDays).toBe(PRACTICE_WEEK_WINDOW_DAYS * 2);
  });
});
