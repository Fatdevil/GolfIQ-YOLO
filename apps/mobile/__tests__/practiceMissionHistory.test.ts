import { describe, expect, it, vi } from 'vitest';

import {
  PRACTICE_MISSION_WINDOW_DAYS,
  summarizeRecentPracticeHistory,
  type PracticeMissionSession,
} from '@app/storage/practiceMissionHistory';

const NOW = new Date('2024-06-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('practiceMissionHistory', () => {
  it('summarizes empty history', () => {
    const overview = summarizeRecentPracticeHistory([], NOW);

    expect(overview).toEqual({
      totalSessions: 0,
      completedSessions: 0,
      windowDays: PRACTICE_MISSION_WINDOW_DAYS,
      lastCompleted: undefined,
      lastStarted: undefined,
    });
  });

  it('filters to recent window and counts completions', () => {
    const recent: PracticeMissionSession = {
      id: 's1',
      recommendationId: 'rec-1',
      startedAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      completedAt: new Date(NOW.getTime() - DAY_MS / 2).toISOString(),
      targetClubs: ['7i'],
      totalShots: 12,
      completed: true,
    };
    const old: PracticeMissionSession = {
      id: 's2',
      recommendationId: 'rec-2',
      startedAt: new Date(NOW.getTime() - DAY_MS * 10).toISOString(),
      targetClubs: ['PW'],
      totalShots: 4,
      completed: false,
    };

    const overview = summarizeRecentPracticeHistory([recent, old], NOW);

    expect(overview.totalSessions).toBe(1);
    expect(overview.completedSessions).toBe(1);
    expect(overview.lastCompleted?.id).toBe('s1');
    expect(overview.lastStarted?.id).toBe('s1');
  });

  it('prefers completion time when choosing the latest completed session', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const recentCompleted: PracticeMissionSession = {
      id: 'recent-complete',
      recommendationId: 'rec-3',
      startedAt: new Date(NOW.getTime() - DAY_MS * 2).toISOString(),
      completedAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      targetClubs: ['9i'],
      totalShots: 10,
      completed: true,
    };
    const latestStarted: PracticeMissionSession = {
      id: 'latest-started',
      recommendationId: 'rec-4',
      startedAt: NOW.toISOString(),
      targetClubs: ['5w'],
      totalShots: 5,
      completed: false,
    };

    const overview = summarizeRecentPracticeHistory([recentCompleted, latestStarted], NOW);

    expect(overview.totalSessions).toBe(2);
    expect(overview.completedSessions).toBe(1);
    expect(overview.lastCompleted?.id).toBe('recent-complete');
    expect(overview.lastStarted?.id).toBe('latest-started');
    vi.useRealTimers();
  });
});
