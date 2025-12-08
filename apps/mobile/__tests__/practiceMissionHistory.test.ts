import { describe, expect, it, vi } from 'vitest';

import {
  PRACTICE_MISSION_WINDOW_DAYS,
  summarizeRecentPracticeHistory,
} from '@app/storage/practiceMissionHistory';
import type { PracticeMissionHistoryEntry } from '@shared/practice/practiceHistory';

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
      streakDays: 0,
    });
  });

  it('filters to recent window and counts completions', () => {
    const recent: PracticeMissionHistoryEntry = {
      id: 's1',
      missionId: 'rec-1',
      startedAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      endedAt: new Date(NOW.getTime() - DAY_MS / 2).toISOString(),
      targetClubs: ['7i'],
      completedSampleCount: 12,
      status: 'completed',
    };
    const old: PracticeMissionHistoryEntry = {
      id: 's2',
      missionId: 'rec-2',
      startedAt: new Date(NOW.getTime() - DAY_MS * 20).toISOString(),
      targetClubs: ['PW'],
      completedSampleCount: 4,
      status: 'abandoned',
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
    const recentCompleted: PracticeMissionHistoryEntry = {
      id: 'recent-complete',
      missionId: 'rec-3',
      startedAt: new Date(NOW.getTime() - DAY_MS * 2).toISOString(),
      endedAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      targetClubs: ['9i'],
      completedSampleCount: 10,
      status: 'completed',
    };
    const latestStarted: PracticeMissionHistoryEntry = {
      id: 'latest-started',
      missionId: 'rec-4',
      startedAt: NOW.toISOString(),
      targetClubs: ['5w'],
      completedSampleCount: 5,
      status: 'abandoned',
    };

    const overview = summarizeRecentPracticeHistory([recentCompleted, latestStarted], NOW);

    expect(overview.totalSessions).toBe(2);
    expect(overview.completedSessions).toBe(1);
    expect(overview.lastCompleted?.id).toBe('recent-complete');
    expect(overview.lastStarted?.id).toBe('latest-started');
    vi.useRealTimers();
  });
});
