import { describe, expect, it } from 'vitest';

import {
  buildPracticeHistoryList,
  DEFAULT_HISTORY_WINDOW_DAYS,
  type PracticeMissionHistoryEntry,
} from '@shared/practice/practiceHistory';

const NOW = new Date('2024-04-10T12:00:00.000Z');

describe('buildPracticeHistoryList', () => {
  it('orders recent missions newest-first', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'old',
        missionId: 'rec-1',
        startedAt: '2024-04-01T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
      {
        id: 'new',
        missionId: 'rec-1',
        startedAt: '2024-04-09T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 12,
      },
    ];

    const list = buildPracticeHistoryList(entries, { now: NOW, daysBack: DEFAULT_HISTORY_WINDOW_DAYS });

    expect(list.map((item) => item.id)).toEqual(['new', 'old']);
  });

  it('drops missions outside the provided window', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'stale',
        missionId: 'rec-1',
        startedAt: '2024-02-01T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 5,
      },
      {
        id: 'recent',
        missionId: 'rec-1',
        startedAt: '2024-04-09T08:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 8,
      },
    ];

    const list = buildPracticeHistoryList(entries, { now: NOW, daysBack: 30 });

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('recent');
  });

  it('treats zero-swing missions as incomplete and not part of streak', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'today',
        missionId: 'rec-1',
        startedAt: '2024-04-10T08:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
      {
        id: 'yesterday',
        missionId: 'rec-1',
        startedAt: '2024-04-09T08:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 6,
      },
      {
        id: 'attempted',
        missionId: 'rec-1',
        startedAt: '2024-04-08T08:00:00.000Z',
        status: 'abandoned',
        targetClubs: ['7i'],
        completedSampleCount: 0,
      },
    ];

    const list = buildPracticeHistoryList(entries, { now: NOW, daysBack: 7 });
    const attempted = list.find((item) => item.id === 'attempted');

    expect(attempted?.status).toBe('incomplete');
    expect(attempted?.countsTowardStreak).toBe(false);

    const streakFlags = list
      .filter((item) => item.status === 'completed')
      .map((item) => item.countsTowardStreak);
    expect(streakFlags).toEqual([true, true]);
  });
});
