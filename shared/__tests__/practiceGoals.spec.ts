import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL,
  PRACTICE_GOAL_WINDOW_DAYS,
  buildWeeklyPracticeGoalProgress,
} from '../practice/practiceGoals';
import type { PracticeMissionHistoryEntry } from '../practice/practiceHistory';

const baseMission: PracticeMissionHistoryEntry = {
  id: 'entry-1',
  missionId: 'practice_mission',
  startedAt: '2024-01-01T00:00:00Z',
  endedAt: '2024-01-01T01:00:00Z',
  status: 'completed',
  targetClubs: [],
  completedSampleCount: 10,
};

function buildEntry(overrides: Partial<PracticeMissionHistoryEntry>): PracticeMissionHistoryEntry {
  return { ...baseMission, ...overrides };
}

describe('practiceGoals', () => {
  const now = new Date('2024-02-08T12:00:00Z');

  it('handles empty history by returning zero progress', () => {
    const progress = buildWeeklyPracticeGoalProgress({ missionHistory: [], now });

    expect(progress).toEqual({
      goalId: 'weekly_mission_completions',
      targetCompletions: DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL,
      completedInWindow: 0,
      remainingToTarget: DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL,
      windowDays: PRACTICE_GOAL_WINDOW_DAYS,
      isOnTrack: false,
    });
  });

  it('returns on-track when completions exactly meet the target', () => {
    const missionHistory = [
      buildEntry({ id: 'e1', endedAt: '2024-02-05T18:00:00Z' }),
      buildEntry({ id: 'e2', endedAt: '2024-02-06T18:00:00Z' }),
      buildEntry({ id: 'e3', endedAt: '2024-02-07T18:00:00Z' }),
    ];

    const progress = buildWeeklyPracticeGoalProgress({ missionHistory, now, targetCompletions: 3 });

    expect(progress.completedInWindow).toBe(3);
    expect(progress.remainingToTarget).toBe(0);
    expect(progress.isOnTrack).toBe(true);
  });

  it('caps remaining to zero when completions exceed the target', () => {
    const missionHistory = [
      buildEntry({ id: 'e1', endedAt: '2024-02-05T18:00:00Z' }),
      buildEntry({ id: 'e2', endedAt: '2024-02-06T18:00:00Z' }),
      buildEntry({ id: 'e3', endedAt: '2024-02-07T18:00:00Z' }),
      buildEntry({ id: 'e4', endedAt: '2024-02-08T18:00:00Z' }),
    ];

    const progress = buildWeeklyPracticeGoalProgress({ missionHistory, now, targetCompletions: 3 });

    expect(progress.completedInWindow).toBe(4);
    expect(progress.remainingToTarget).toBe(0);
    expect(progress.isOnTrack).toBe(true);
  });

  it('ignores missions outside of the goal window', () => {
    const missionHistory = [
      buildEntry({ id: 'old', endedAt: '2024-01-20T10:00:00Z' }),
      buildEntry({ id: 'recent', endedAt: '2024-02-06T10:00:00Z' }),
    ];

    const progress = buildWeeklyPracticeGoalProgress({ missionHistory, now, targetCompletions: 2 });

    expect(progress.completedInWindow).toBe(1);
    expect(progress.remainingToTarget).toBe(1);
    expect(progress.isOnTrack).toBe(false);
  });
});
