import { describe, expect, it } from 'vitest';

import type { PracticeMissionHistoryEntry } from '../practice/practiceHistory';
import { shouldShowWeeklyGoalNudge } from '../practice/practiceGoalNudge';

function buildHistory(completed: number): PracticeMissionHistoryEntry[] {
  const entries: PracticeMissionHistoryEntry[] = [];
  for (let i = 0; i < completed; i += 1) {
    entries.push({
      id: `mission-${i}`,
      missionId: `mission-${i}`,
      startedAt: '2024-02-01T10:00:00Z',
      endedAt: '2024-02-01T10:30:00Z',
      status: 'completed',
      targetClubs: [],
      completedSampleCount: 10,
    });
  }
  return entries;
}

describe('shouldShowWeeklyGoalNudge', () => {
  it('returns true when within one mission of the target', () => {
    const history = buildHistory(2);
    const result = shouldShowWeeklyGoalNudge(history, { targetMissionsPerWeek: 3 }, new Date('2024-02-05T12:00:00Z'));

    expect(result.shouldShow).toBe(true);
    expect(result.remainingMissions).toBe(1);
    expect(result.completionPercent).toBeCloseTo(2 / 3);
  });

  it('returns true when above 80% completion', () => {
    const history = buildHistory(4);
    const result = shouldShowWeeklyGoalNudge(history, { targetMissionsPerWeek: 5 }, new Date('2024-02-05T12:00:00Z'));

    expect(result.shouldShow).toBe(true);
    expect(result.remainingMissions).toBe(1);
    expect(result.completionPercent).toBeCloseTo(0.8);
  });

  it('hides the nudge when no progress has been made', () => {
    const history = buildHistory(0);
    const result = shouldShowWeeklyGoalNudge(history, { targetMissionsPerWeek: 2 }, new Date('2024-02-05T12:00:00Z'));

    expect(result.shouldShow).toBe(false);
    expect(result.remainingMissions).toBe(2);
  });

  it('hides the nudge after the goal is complete', () => {
    const history = buildHistory(3);
    const result = shouldShowWeeklyGoalNudge(history, { targetMissionsPerWeek: 3 }, new Date('2024-02-05T12:00:00Z'));

    expect(result.shouldShow).toBe(false);
    expect(result.remainingMissions).toBe(0);
  });
});
