import { describe, expect, it } from 'vitest';

import {
  MAX_PRACTICE_HISTORY_ENTRIES,
  computeMissionStreak,
  computeRecentCompletionSummary,
  normalizePracticeHistoryEntries,
  recordMissionOutcome,
} from '@shared/practice/practiceHistory';
import type { PracticeMissionHistoryEntry, PracticeMissionOutcome } from '@shared/practice/practiceHistory';

describe('practiceHistory helpers', () => {
  it('records outcomes and trims to max size', () => {
    let state: PracticeMissionHistoryEntry[] = [];
    const baseOutcome: PracticeMissionOutcome = {
      missionId: 'mission-1',
      startedAt: '2024-01-01T00:00:00.000Z',
      targetClubs: ['7i'],
      completedSampleCount: 1,
    };

    for (let i = 0; i < MAX_PRACTICE_HISTORY_ENTRIES + 5; i += 1) {
      state = recordMissionOutcome(state, {
        ...baseOutcome,
        startedAt: new Date(2024, 0, i + 1).toISOString(),
        completedSampleCount: 2,
      });
    }

    expect(state).toHaveLength(MAX_PRACTICE_HISTORY_ENTRIES);
    expect(state[0].startedAt).toContain('2024-01-06');
  });

  it('computes completion summary over the provided window', () => {
    const now = new Date('2024-02-10T12:00:00.000Z');
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'a',
        missionId: 'mission-1',
        startedAt: '2024-02-09T10:00:00.000Z',
        endedAt: '2024-02-09T10:30:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 12,
      },
      {
        id: 'b',
        missionId: 'mission-1',
        startedAt: '2024-02-08T10:00:00.000Z',
        endedAt: '2024-02-08T10:10:00.000Z',
        status: 'abandoned',
        targetClubs: ['7i'],
        targetSampleCount: 15,
        completedSampleCount: 5,
      },
      {
        id: 'c',
        missionId: 'mission-1',
        startedAt: '2024-01-20T10:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 5,
      },
    ];

    const summary = computeRecentCompletionSummary(entries, 14, now);

    expect(summary).toEqual({ completed: 1, attempted: 2 });
  });

  it('computes streak with gaps correctly', () => {
    const entries: PracticeMissionHistoryEntry[] = [
      {
        id: 'a',
        missionId: 'mission-1',
        startedAt: '2024-02-10T09:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
      {
        id: 'b',
        missionId: 'mission-1',
        startedAt: '2024-02-09T09:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
      {
        id: 'c',
        missionId: 'mission-1',
        startedAt: '2024-02-07T09:00:00.000Z',
        status: 'completed',
        targetClubs: ['7i'],
        completedSampleCount: 10,
      },
    ];

    const streak = computeMissionStreak(entries, 'mission-1', new Date('2024-02-10T23:59:00.000Z'));

    expect(streak.consecutiveDays).toBe(2);
    expect(streak.lastCompletedAt).toBe('2024-02-10T09:00:00.000Z');
  });

  it('ignores sessions with zero target swings', () => {
    const state: PracticeMissionHistoryEntry[] = [];

    const next = recordMissionOutcome(state, {
      missionId: 'mission-1',
      startedAt: '2024-02-01T10:00:00.000Z',
      targetClubs: ['pw'],
      completedSampleCount: 0,
    });

    expect(next).toBe(state);
  });

  it('normalizes legacy records and skips invalid timestamps', () => {
    const legacy = [
      {
        id: 'legacy-1',
        recommendationId: 'mission-1',
        startedAt: '2024-01-01T00:00:00.000Z',
        completedAt: '2024-01-01T00:10:00.000Z',
        targetSampleCount: 10,
        totalShots: 10,
        targetClubs: ['7i'],
        completed: true,
      },
      {
        id: 'legacy-2',
        recommendationId: 'mission-1',
        startedAt: 'invalid',
        completedAt: undefined,
        targetSampleCount: 10,
        totalShots: 10,
        targetClubs: ['7i'],
        completed: false,
      },
    ];

    const normalized = normalizePracticeHistoryEntries(legacy);

    expect(normalized).toHaveLength(1);
    expect(normalized[0].status).toBe('completed');
  });
});
