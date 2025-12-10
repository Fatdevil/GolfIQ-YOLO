import { PRACTICE_GOAL_WINDOW_DAYS } from './practiceGoals';
import { DEFAULT_TARGET_MISSIONS_PER_WEEK } from './practiceGoalSettings';
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

export interface WeeklyPracticePlanHomeSummary {
  completedCount: number;
  totalCount: number;
  isPlanCompleted: boolean;
  hasPlan: boolean;
}

export function buildWeeklyPracticePlan(
  missions: PracticeMissionListItem[],
  options?: { maxMissions?: number; targetMissionsPerWeek?: number },
): WeeklyPracticePlanMission[] {
  const maxMissions =
    options?.maxMissions ?? options?.targetMissionsPerWeek ?? DEFAULT_TARGET_MISSIONS_PER_WEEK;
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
  targetMissionsPerWeek?: number;
}): WeeklyPracticePlanStatus {
  const { missions, history, now = new Date(), maxMissionsInPlan, targetMissionsPerWeek } = options;

  const planMissions = buildWeeklyPracticePlan(missions, {
    maxMissions: maxMissionsInPlan,
    targetMissionsPerWeek,
  });
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

export function buildWeeklyPracticePlanHomeSummary(options: {
  missions: PracticeMissionListItem[] | null | undefined;
  history: PracticeMissionHistoryEntry[] | null | undefined;
  now?: Date;
  targetMissionsPerWeek?: number;
}): WeeklyPracticePlanHomeSummary {
  if (!options.missions || !options.history) {
    return { completedCount: 0, totalCount: 0, isPlanCompleted: false, hasPlan: false };
  }

  const status = buildWeeklyPracticePlanStatus({
    missions: options.missions,
    history: options.history,
    now: options.now,
    targetMissionsPerWeek: options.targetMissionsPerWeek,
  });

  return {
    completedCount: status.completedCount,
    totalCount: status.totalCount,
    isPlanCompleted: status.isPlanCompleted,
    hasPlan: status.totalCount > 0,
  };
}
