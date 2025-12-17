import { describe, expect, it } from 'vitest';

import type { PracticeSession } from './practiceSessionStorage';
import {
  getPracticeSessionDurationMinutes,
  getPracticeStreakDays,
  getThisWeekTotals,
} from './practiceInsights';

function buildSession(id: string, start: string, end?: string, drills = ['d1']): PracticeSession {
  return {
    id,
    weekStartISO: '2024-03-11T00:00:00.000Z',
    startedAt: start,
    endedAt: end,
    drillIds: drills,
    completedDrillIds: drills,
    skippedDrillIds: [],
  };
}

describe('practiceInsights', () => {
  it('counts streak including today', () => {
    const sessions = [
      buildSession('s1', '2024-03-08T15:00:00Z', '2024-03-08T15:20:00Z'),
      buildSession('s2', '2024-03-09T15:00:00Z', '2024-03-09T15:20:00Z'),
      buildSession('s3', '2024-03-10T15:00:00Z', '2024-03-10T15:20:00Z'),
    ];

    const streak = getPracticeStreakDays(sessions, new Date('2024-03-10T18:00:00Z'));

    expect(streak).toBe(3);
  });

  it('counts streak ending yesterday when today is empty', () => {
    const sessions = [
      buildSession('s1', '2024-03-08T15:00:00Z', '2024-03-08T15:20:00Z'),
      buildSession('s2', '2024-03-09T15:00:00Z', '2024-03-09T15:20:00Z'),
    ];

    const streak = getPracticeStreakDays(sessions, new Date('2024-03-10T12:00:00Z'));

    expect(streak).toBe(2);
  });

  it('streak breaks on gaps or incomplete sessions', () => {
    const sessions = [
      buildSession('complete', '2024-03-08T10:00:00Z', '2024-03-08T10:10:00Z'),
      buildSession('gap', '2024-03-06T10:00:00Z', '2024-03-06T10:10:00Z'),
      buildSession('incomplete', '2024-03-10T10:00:00Z'),
    ];

    const streak = getPracticeStreakDays(sessions, new Date('2024-03-10T12:00:00Z'));

    expect(streak).toBe(1);
  });

  it('computes weekly totals from completed sessions only', () => {
    const sessions = [
      buildSession('this-week-1', '2024-03-11T10:00:00Z', '2024-03-11T10:30:00Z', ['a', 'b']),
      buildSession('this-week-2', '2024-03-12T11:00:00Z', '2024-03-12T11:05:00Z', ['c']),
      buildSession('last-week', '2024-03-09T11:00:00Z', '2024-03-09T11:20:00Z', ['d']),
      buildSession('incomplete', '2024-03-13T11:00:00Z', undefined, ['e']),
    ];

    const totals = getThisWeekTotals(sessions, new Date('2024-03-13T12:00:00Z'));

    expect(totals).toEqual({ sessionCount: 2, minutes: 35 });
  });

  it('returns duration in minutes with minimum of one minute', () => {
    expect(
      getPracticeSessionDurationMinutes(
        buildSession('short', '2024-03-11T10:00:00Z', '2024-03-11T10:00:10Z'),
      ),
    ).toBe(1);
    expect(
      getPracticeSessionDurationMinutes(
        buildSession('long', '2024-03-11T10:00:00Z', '2024-03-11T10:10:30Z'),
      ),
    ).toBe(11);
  });
});
