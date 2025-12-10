import { describe, expect, it } from 'vitest';

import type { PracticeMissionListItem } from '@shared/practice/practiceMissionsList';
import { buildWeeklyPracticeComparison } from '@shared/practice/practiceInsights';

const baseMissions: PracticeMissionListItem[] = [
  {
    id: 'mission-a',
    title: 'Mission A',
    subtitleKey: 'practice.missions.status.recommended',
    status: 'recommended',
    priorityScore: 10,
    lastCompletedAt: null,
    completionCount: 0,
    inStreak: false,
  },
  {
    id: 'mission-b',
    title: 'Mission B',
    subtitleKey: 'practice.missions.status.recommended',
    status: 'recommended',
    priorityScore: 9,
    lastCompletedAt: null,
    completionCount: 0,
    inStreak: false,
  },
];

const now = new Date('2024-06-14T12:00:00Z');

function buildEntry(missionId: string, daysAgo: number): any {
  return {
    id: `${missionId}-${daysAgo}`,
    missionId,
    startedAt: new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    status: 'completed',
    targetClubs: [],
    completedSampleCount: 5,
  };
}

describe('buildWeeklyPracticeComparison', () => {
  it('compares a strong current week to the previous week', () => {
    const history = [
      buildEntry('mission-a', 1),
      buildEntry('mission-b', 2),
      buildEntry('mission-b', 3),
      buildEntry('mission-a', 8),
    ];

    const comparison = buildWeeklyPracticeComparison({ history, missions: baseMissions, now });

    expect(comparison.thisWeek.missionsCompleted).toBe(3);
    expect(comparison.thisWeek.goalReached).toBe(true);
    expect(comparison.thisWeek.planCompleted).toBe(true);
    expect(comparison.lastWeek.missionsCompleted).toBe(1);
    expect(comparison.lastWeek.goalReached).toBe(false);
    expect(comparison.lastWeek.planCompleted).toBe(true);
  });

  it('captures when the previous week outperformed the current week', () => {
    const history = [buildEntry('mission-a', 9), buildEntry('mission-b', 10), buildEntry('mission-b', 13)];

    const comparison = buildWeeklyPracticeComparison({ history, missions: baseMissions, now });

    expect(comparison.thisWeek.missionsCompleted).toBe(0);
    expect(comparison.thisWeek.goalReached).toBe(false);
    expect(comparison.thisWeek.planCompleted).toBe(false);
    expect(comparison.lastWeek.missionsCompleted).toBe(3);
    expect(comparison.lastWeek.goalReached).toBe(true);
    expect(comparison.lastWeek.planCompleted).toBe(true);
  });

  it('handles empty history gracefully', () => {
    const comparison = buildWeeklyPracticeComparison({ history: [], missions: baseMissions, now });

    expect(comparison.thisWeek.missionsCompleted).toBe(0);
    expect(comparison.lastWeek.missionsCompleted).toBe(0);
    expect(comparison.thisWeek.goalReached).toBe(false);
    expect(comparison.lastWeek.goalReached).toBe(false);
    expect(comparison.thisWeek.planCompleted).toBe(false);
    expect(comparison.lastWeek.planCompleted).toBe(false);
  });
});
