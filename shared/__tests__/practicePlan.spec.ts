import { describe, expect, it } from 'vitest';

import { buildPracticeMissionsList, type PracticeMissionDefinition } from '@shared/practice/practiceMissionsList';
import { buildWeeklyPracticePlan } from '@shared/practice/practicePlan';

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
