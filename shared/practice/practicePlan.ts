import type { PracticeMissionListItem } from './practiceMissionsList';

export type WeeklyPracticePlanMission = PracticeMissionListItem & {
  planRank: number;
};

export function buildWeeklyPracticePlan(
  missions: PracticeMissionListItem[],
  options?: { maxMissions?: number },
): WeeklyPracticePlanMission[] {
  const maxMissions = options?.maxMissions ?? 3;
  if (maxMissions <= 0 || missions.length === 0) return [];

  return missions.slice(0, maxMissions).map((mission, index) => ({
    ...mission,
    planRank: index + 1,
  }));
}
