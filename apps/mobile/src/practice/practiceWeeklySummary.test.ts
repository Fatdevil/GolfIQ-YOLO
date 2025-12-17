import { describe, expect, it } from 'vitest';

import type { PracticePlan } from './practicePlanStorage';
import type { PracticeSession } from './practiceSessionStorage';
import { buildPracticeWeeklySummary } from './practiceWeeklySummary';

const baseSession: PracticeSession = {
  id: 'session-1',
  weekStartISO: '2024-03-11T00:00:00.000Z',
  startedAt: '2024-03-12T10:00:00.000Z',
  endedAt: '2024-03-12T10:30:00.000Z',
  drillIds: ['a', 'b'],
  completedDrillIds: ['a'],
  skippedDrillIds: [],
};

const plan: PracticePlan = {
  weekStartISO: '2024-03-11T00:00:00.000Z',
  items: [
    { id: '1', drillId: 'a', createdAt: '2024-03-11', status: 'done' },
    { id: '2', drillId: 'b', createdAt: '2024-03-11', status: 'planned' },
  ],
};

describe('buildPracticeWeeklySummary', () => {
  it('returns zeros when there are no sessions', () => {
    const summary = buildPracticeWeeklySummary([], plan, new Date('2024-03-14T12:00:00Z'));

    expect(summary.sessionsCount).toBe(0);
    expect(summary.drillsCompleted).toBe(0);
    expect(summary.minutesTotal).toBeNull();
    expect(summary.streakDays).toBe(0);
    expect(summary.hasPlan).toBe(true);
    expect(summary.planCompletionPct).toBeCloseTo(0.5);
  });

  it('ignores sessions outside the current week', () => {
    const summary = buildPracticeWeeklySummary(
      [
        baseSession,
        {
          ...baseSession,
          id: 'session-2',
          endedAt: '2024-03-09T10:30:00.000Z',
          weekStartISO: '2024-03-04T00:00:00.000Z',
        },
      ],
      plan,
      new Date('2024-03-13T12:00:00Z'),
    );

    expect(summary.sessionsCount).toBe(1);
    expect(summary.drillsCompleted).toBe(1);
    expect(summary.minutesTotal).toBe(30);
    expect(summary.weekStartISO).toBe('2024-03-11T00:00:00.000Z');
  });

  it('ignores corrupted entries and null minutes', () => {
    const summary = buildPracticeWeeklySummary(
      [
        { ...baseSession, id: 'session-3', endedAt: 'invalid-date' },
        { ...baseSession, id: 'session-4', endedAt: undefined },
        { ...baseSession, id: 'session-5', endedAt: '2024-03-13T10:15:00.000Z' },
      ],
      plan,
      new Date('2024-03-14T12:00:00Z'),
    );

    expect(summary.sessionsCount).toBe(1);
    expect(summary.drillsCompleted).toBe(1);
    expect(summary.minutesTotal).toBeNull();
  });
});
