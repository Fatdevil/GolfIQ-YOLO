import { describe, expect, it } from 'vitest';

import {
  DEFAULT_WEEKLY_PRACTICE_MISSION_GOAL,
  PRACTICE_GOAL_WINDOW_DAYS,
  buildWeeklyPracticeGoalProgress,
  buildWeeklyGoalStreak,
  didJustReachWeeklyGoal,
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
      status: 'not_started',
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
    expect(progress.status).toBe('goal_reached');
    expect(progress.isOnTrack).toBe(true);
  });

  it('caps remaining to zero when completions exceed the target', () => {
    const missionHistory = [
      buildEntry({ id: 'e1', endedAt: '2024-02-05T18:00:00Z' }),
      buildEntry({ id: 'e2', endedAt: '2024-02-06T18:00:00Z' }),
      buildEntry({ id: 'e3', endedAt: '2024-02-07T18:00:00Z' }),
      buildEntry({ id: 'e4', endedAt: '2024-02-08T10:00:00Z' }),
    ];

    const progress = buildWeeklyPracticeGoalProgress({ missionHistory, now, targetCompletions: 3 });

    expect(progress.completedInWindow).toBe(4);
    expect(progress.remainingToTarget).toBe(0);
    expect(progress.status).toBe('exceeded');
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
    expect(progress.status).toBe('in_progress');
    expect(progress.isOnTrack).toBe(false);
  });

  it('derives all goal statuses', () => {
    const baseEntry = buildEntry({ id: 'recent', endedAt: '2024-02-07T10:00:00Z' });

    expect(buildWeeklyPracticeGoalProgress({ missionHistory: [], now, targetCompletions: 2 }).status).toBe('not_started');
    expect(
      buildWeeklyPracticeGoalProgress({ missionHistory: [baseEntry], now, targetCompletions: 2 }).status,
    ).toBe('in_progress');
    expect(
      buildWeeklyPracticeGoalProgress({
        missionHistory: [baseEntry, buildEntry({ id: 'recent-2', endedAt: '2024-02-06T10:00:00Z' })],
        now,
        targetCompletions: 2,
      }).status,
    ).toBe('goal_reached');
    expect(
      buildWeeklyPracticeGoalProgress({
        missionHistory: [
          baseEntry,
          buildEntry({ id: 'recent-2', endedAt: '2024-02-06T10:00:00Z' }),
          buildEntry({ id: 'recent-3', endedAt: '2024-02-05T10:00:00Z' }),
        ],
        now,
        targetCompletions: 2,
      }).status,
    ).toBe('exceeded');
  });

  it('identifies when the weekly goal is first reached', () => {
    const before = buildWeeklyPracticeGoalProgress({
      missionHistory: [buildEntry({ endedAt: '2024-02-07T08:00:00Z' })],
      now,
      targetCompletions: 2,
    });
    const after = buildWeeklyPracticeGoalProgress({
      missionHistory: [
        buildEntry({ id: 'a1', endedAt: '2024-02-07T08:00:00Z' }),
        buildEntry({ id: 'a2', endedAt: '2024-02-07T10:00:00Z' }),
      ],
      now,
      targetCompletions: 2,
    });

    expect(didJustReachWeeklyGoal({ before, after })).toBe(true);
  });

  it('ignores repeated completions after the goal is already met', () => {
    const before = buildWeeklyPracticeGoalProgress({
      missionHistory: [
        buildEntry({ endedAt: '2024-02-07T08:00:00Z' }),
        buildEntry({ id: 'a2', endedAt: '2024-02-07T10:00:00Z' }),
      ],
      now,
      targetCompletions: 2,
    });
    const after = buildWeeklyPracticeGoalProgress({
      missionHistory: [
        buildEntry({ endedAt: '2024-02-07T08:00:00Z' }),
        buildEntry({ id: 'a2', endedAt: '2024-02-07T10:00:00Z' }),
        buildEntry({ id: 'a3', endedAt: '2024-02-06T10:00:00Z' }),
      ],
      now,
      targetCompletions: 2,
    });

    expect(didJustReachWeeklyGoal({ before, after })).toBe(false);
  });

  describe('buildWeeklyGoalStreak', () => {
    it('counts consecutive weeks that meet the goal', () => {
      const missionHistory = [
        // Current week (week ending Feb 8)
        buildEntry({ id: 'c1', endedAt: '2024-02-05T18:00:00Z' }),
        buildEntry({ id: 'c2', endedAt: '2024-02-06T18:00:00Z' }),
        buildEntry({ id: 'c3', endedAt: '2024-02-07T18:00:00Z' }),
        // Previous week (week ending Feb 1)
        buildEntry({ id: 'p1', endedAt: '2024-01-30T18:00:00Z' }),
        buildEntry({ id: 'p2', endedAt: '2024-01-31T18:00:00Z' }),
        buildEntry({ id: 'p3', endedAt: '2024-02-01T10:00:00Z' }),
        // Two weeks ago (week ending Jan 25)
        buildEntry({ id: 'o1', endedAt: '2024-01-23T18:00:00Z' }),
        buildEntry({ id: 'o2', endedAt: '2024-01-24T18:00:00Z' }),
        buildEntry({ id: 'o3', endedAt: '2024-01-25T10:00:00Z' }),
      ];

      const streak = buildWeeklyGoalStreak(missionHistory, now);

      expect(streak.currentStreakWeeks).toBe(3);
    });

    it('stops counting when a week misses the goal', () => {
      const missionHistory = [
        // Current week meets the goal
        buildEntry({ id: 'c1', endedAt: '2024-02-05T18:00:00Z' }),
        buildEntry({ id: 'c2', endedAt: '2024-02-06T18:00:00Z' }),
        buildEntry({ id: 'c3', endedAt: '2024-02-07T18:00:00Z' }),
        // Previous week misses the goal
        buildEntry({ id: 'p1', endedAt: '2024-01-31T18:00:00Z' }),
      ];

      const streak = buildWeeklyGoalStreak(missionHistory, now);

      expect(streak.currentStreakWeeks).toBe(1);
    });

    it('returns zero when no week meets the goal', () => {
      const missionHistory = [
        buildEntry({ id: 'only', endedAt: '2024-02-07T18:00:00Z' }),
      ];

      const streak = buildWeeklyGoalStreak(missionHistory, now);

      expect(streak.currentStreakWeeks).toBe(0);
    });
  });
});
