import { PRACTICE_GOAL_WINDOW_DAYS } from './practiceGoals';
import { buildMissionProgressById, type PracticeMissionHistoryEntry } from './practiceHistory';
import type { PracticeMissionListItem } from './practiceMissionsList';

export type WeeklyPracticePlanMission = PracticeMissionListItem & {
  planRank: number;
};

export type WeeklyPlanMissionProgress = WeeklyPracticePlanMission & {
  completionsThisWeek: number;
  isCompletedThisWeek: boolean;
};

export interface WeeklyPracticePlanStatus {
  missions: WeeklyPlanMissionProgress[];
  completedCount: number;
  totalCount: number;
  isPlanCompleted: boolean;
}

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

export function buildWeeklyPracticePlanStatus(options: {
  missions: PracticeMissionListItem[];
  history: PracticeMissionHistoryEntry[];
  now?: Date;
  maxMissionsInPlan?: number;
}): WeeklyPracticePlanStatus {
  const { missions, history, now = new Date(), maxMissionsInPlan } = options;

  const planMissions = buildWeeklyPracticePlan(missions, { maxMissions: maxMissionsInPlan });
  if (planMissions.length === 0) {
    return { missions: [], completedCount: 0, totalCount: 0, isPlanCompleted: false };
  }

  const progressById = buildMissionProgressById(
    history,
    planMissions.map((mission) => mission.id),
    { windowDays: PRACTICE_GOAL_WINDOW_DAYS, now },
  );

  const missionsWithProgress: WeeklyPlanMissionProgress[] = planMissions.map((mission) => {
    const progress = progressById[mission.id];
    const completionsThisWeek = progress?.completedSessions ?? 0;
    const isCompletedThisWeek = completionsThisWeek > 0;

    return {
      ...mission,
      completionsThisWeek,
      isCompletedThisWeek,
    };
  });

  const completedCount = missionsWithProgress.filter((mission) => mission.isCompletedThisWeek).length;
  const totalCount = missionsWithProgress.length;

  return {
    missions: missionsWithProgress,
    completedCount,
    totalCount,
    isPlanCompleted: totalCount > 0 && completedCount === totalCount,
  };
}
