import { describe, expect, it } from 'vitest';

import {
  buildPracticeHistoryList,
  buildPracticeMissionDetail,
  buildMissionProgressById,
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

describe('buildMissionProgressById', () => {
  const NOW = new Date('2024-04-10T12:00:00.000Z');

  it('returns defaults when no history', () => {
    const progress = buildMissionProgressById([], ['rec-1'], { now: NOW, windowDays: DEFAULT_HISTORY_WINDOW_DAYS });

    expect(progress['rec-1']).toEqual({
      missionId: 'rec-1',
      completedSessions: 0,
      lastCompletedAt: null,
      inStreak: false,
    });
  });

  it('tracks counts and last completion per mission', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'one',
        missionId: 'rec-1',
        startedAt: '2024-04-05T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
      {
        id: 'two',
        missionId: 'rec-1',
        startedAt: '2024-04-09T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 12,
      },
      {
        id: 'three',
        missionId: 'rec-2',
        startedAt: '2024-04-08T12:00:00.000Z',
        status: 'completed',
        targetClubs: ['pw'],
        completedSampleCount: 8,
      },
    ];

    const progress = buildMissionProgressById(entries, ['rec-1', 'rec-2'], { now: NOW, windowDays: 14 });

    expect(progress['rec-1'].completedSessions).toBe(2);
    expect(progress['rec-1'].lastCompletedAt).toBe(new Date('2024-04-09T10:00:00.000Z').getTime());
    expect(progress['rec-2'].completedSessions).toBe(1);
  });

  it('ignores missions outside the window', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'stale',
        missionId: 'rec-1',
        startedAt: '2024-02-01T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 5,
      },
    ];

    const progress = buildMissionProgressById(entries, ['rec-1'], { now: NOW, windowDays: 30 });

    expect(progress['rec-1'].completedSessions).toBe(0);
    expect(progress['rec-1'].lastCompletedAt).toBeNull();
  });

  it('sets streak flag when mission has streak day', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'one',
        missionId: 'rec-1',
        startedAt: '2024-04-09T08:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
      {
        id: 'two',
        missionId: 'rec-1',
        startedAt: '2024-04-10T08:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 12,
      },
      {
        id: 'other',
        missionId: 'rec-2',
        startedAt: '2024-04-05T09:00:00.000Z',
        status: 'completed',
        targetClubs: ['pw'],
        completedSampleCount: 6,
      },
    ];

    const progress = buildMissionProgressById(entries, ['rec-1', 'rec-2'], { now: NOW, windowDays: 14 });

    expect(progress['rec-1'].inStreak).toBe(true);
    expect(progress['rec-2'].inStreak).toBe(false);
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
