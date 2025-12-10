import { describe, expect, it } from 'vitest';

import { buildPracticeMissionsList, type PracticeMissionDefinition } from '@shared/practice/practiceMissionsList';
import {
  buildWeeklyPracticePlan,
  buildWeeklyPracticePlanHomeSummary,
  buildWeeklyPracticePlanStatus,
  type WeeklyPracticePlanHomeSummary,
  type WeeklyPracticePlanStatus,
} from '@shared/practice/practicePlan';

function buildMissions(count: number): ReturnType<typeof buildPracticeMissionsList> {
  const missions: PracticeMissionDefinition[] = Array.from({ length: count }).map((_, index) => ({
    id: `mission-${index + 1}`,
    title: `Mission ${index + 1}`,
  }));

  return buildPracticeMissionsList({
    bagReadiness: null,
    missionProgressById: {},
    missions,
    now: new Date('2024-01-01T00:00:00Z'),
  });
}

describe('buildWeeklyPracticePlan', () => {
  it('returns the top 3 prioritized missions with ranks', () => {
    const missions = buildMissions(5);

    const plan = buildWeeklyPracticePlan(missions);

    expect(plan).toHaveLength(3);
    expect(plan.map((mission) => mission.id)).toEqual(missions.slice(0, 3).map((m) => m.id));
    expect(plan.map((mission) => mission.planRank)).toEqual([1, 2, 3]);
  });

  it('returns all missions when fewer than the max', () => {
    const missions = buildMissions(2);

    const plan = buildWeeklyPracticePlan(missions);

    expect(plan).toHaveLength(2);
    expect(plan.map((mission) => mission.id)).toEqual(['mission-1', 'mission-2']);
  });

  it('returns an empty array when no missions are available', () => {
    const plan = buildWeeklyPracticePlan([]);

    expect(plan).toEqual([]);
  });
});

describe('buildWeeklyPracticePlanStatus', () => {
  const now = new Date('2024-01-08T12:00:00Z');

  function buildHistory(ids: string[]): any[] {
    return ids.map((missionId, index) => ({
      id: `entry-${missionId}-${index}`,
      missionId,
      startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      targetClubs: [],
      completedSampleCount: 10,
    }));
  }

  function evaluate(idsCompleted: string[], idsAll: string[], options?: { historyOffsetDays?: number }): WeeklyPracticePlanStatus {
    const missions = buildMissions(idsAll.length);
    const history = buildHistory(idsCompleted).map((entry) => ({
      ...entry,
      startedAt: new Date(now.getTime() - (options?.historyOffsetDays ?? 2) * 24 * 60 * 60 * 1000).toISOString(),
    }));

    return buildWeeklyPracticePlanStatus({ missions, history, now });
  }

  it('returns completed plan status when all missions have completions this week', () => {
    const status = evaluate(['mission-1', 'mission-2', 'mission-3'], ['mission-1', 'mission-2', 'mission-3', 'mission-4']);

    expect(status.isPlanCompleted).toBe(true);
    expect(status.completedCount).toBe(status.totalCount);
    expect(status.totalCount).toBe(3);
    expect(status.missions.every((mission) => mission.isCompletedThisWeek)).toBe(true);
  });

  it('marks only missions with completions as done when partially complete', () => {
    const status = evaluate(['mission-1'], ['mission-1', 'mission-2', 'mission-3']);

    expect(status.isPlanCompleted).toBe(false);
    expect(status.completedCount).toBe(1);
    expect(status.totalCount).toBe(3);
    expect(status.missions.find((m) => m.id === 'mission-1')?.isCompletedThisWeek).toBe(true);
    expect(status.missions.filter((m) => m.id !== 'mission-1').every((m) => !m.isCompletedThisWeek)).toBe(true);
  });

  it('returns no completions when history is outside the current week', () => {
    const status = evaluate(['mission-1', 'mission-2'], ['mission-1', 'mission-2', 'mission-3'], { historyOffsetDays: 10 });

    expect(status.isPlanCompleted).toBe(false);
    expect(status.completedCount).toBe(0);
    expect(status.missions.every((mission) => !mission.isCompletedThisWeek)).toBe(true);
  });

  it('returns an incomplete plan when there are no missions', () => {
    const status = buildWeeklyPracticePlanStatus({ missions: [], history: [], now });

    expect(status.totalCount).toBe(0);
    expect(status.isPlanCompleted).toBe(false);
  });
});

describe('buildWeeklyPracticePlanHomeSummary', () => {
  const now = new Date('2024-01-08T12:00:00Z');

  function buildHistory(ids: string[]): any[] {
    return ids.map((missionId, index) => ({
      id: `entry-${missionId}-${index}`,
      missionId,
      startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'completed',
      targetClubs: [],
      completedSampleCount: 10,
    }));
  }

  function evaluate(idsCompleted: string[], idsAll: string[]): WeeklyPracticePlanHomeSummary {
    const missions = buildMissions(idsAll.length);
    const history = buildHistory(idsCompleted);

    return buildWeeklyPracticePlanHomeSummary({ missions, history, now });
  }

  it('summarizes a fully completed plan', () => {
    const summary = evaluate(['mission-1', 'mission-2'], ['mission-1', 'mission-2']);

    expect(summary.hasPlan).toBe(true);
    expect(summary.isPlanCompleted).toBe(true);
    expect(summary.completedCount).toBe(summary.totalCount);
  });

  it('summarizes a partially completed plan', () => {
    const summary = evaluate(['mission-1'], ['mission-1', 'mission-2', 'mission-3']);

    expect(summary.hasPlan).toBe(true);
    expect(summary.isPlanCompleted).toBe(false);
    expect(summary.completedCount).toBe(1);
    expect(summary.totalCount).toBe(3);
  });

  it('returns an empty summary when no missions exist', () => {
    const summary = buildWeeklyPracticePlanHomeSummary({ missions: [], history: [], now });

    expect(summary.hasPlan).toBe(false);
    expect(summary.totalCount).toBe(0);
    expect(summary.isPlanCompleted).toBe(false);
  });

  it('handles missing inputs defensively', () => {
    const summary = buildWeeklyPracticePlanHomeSummary({ missions: null, history: null, now });

    expect(summary.hasPlan).toBe(false);
    expect(summary.totalCount).toBe(0);
    expect(summary.isPlanCompleted).toBe(false);
  });
});
