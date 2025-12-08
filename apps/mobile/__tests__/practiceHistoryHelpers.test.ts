import { describe, expect, it } from 'vitest';

import {
  buildPracticeHistoryList,
  buildPracticeMissionDetail,
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

describe('buildPracticeMissionDetail', () => {
  it('handles legacy entries without targets or end time', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'legacy',
        missionId: 'custom-1',
        startedAt: '2024-04-05T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 12,
      },
    ];

    const detail = buildPracticeMissionDetail(entries, 'legacy');

    expect(detail).not.toBeNull();
    expect(detail?.targetSampleCount).toBeNull();
    expect(detail?.completionRatio).toBeNull();
    expect(detail?.endedAt).toBeNull();
  });

  it('returns detail with streak flag and ratio for modern mission', () => {
    const now = new Date('2024-04-10T12:00:00.000Z');
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'one',
        missionId: 'practice_calibrate:7i',
        startedAt: '2024-04-09T10:00:00.000Z',
        endedAt: '2024-04-09T11:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        targetSampleCount: 24,
        completedSampleCount: 18,
      },
      {
        id: 'two',
        missionId: 'practice_calibrate:7i',
        startedAt: '2024-04-10T10:00:00.000Z',
        endedAt: '2024-04-10T11:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        targetSampleCount: 24,
        completedSampleCount: 24,
      },
    ];

    const detail = buildPracticeMissionDetail(entries, 'two', { now, clubLabels: { '7i': '7 Iron' } });

    expect(detail).not.toBeNull();
    expect(detail?.completionRatio).toBeCloseTo(1);
    expect(detail?.countedTowardStreak).toBe(true);
    expect(detail?.targetClubs[0]).toEqual({ id: '7i', label: '7 Iron' });
  });
});
