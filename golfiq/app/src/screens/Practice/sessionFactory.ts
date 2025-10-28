import type { Drill, Plan, TrainingFocus } from '../../../../../shared/training/types';

export type PracticeSessionDrill = {
  id: string;
  reps?: number;
  durationMin?: number;
  title?: string;
  estTimeMin?: number;
  focus?: TrainingFocus;
};

export type PracticeSession = {
  planId: string;
  focus: TrainingFocus;
  startedAt: number;
  drills: PracticeSessionDrill[];
};

type DrillIndex = Record<string, Drill>;

export const createSessionFromPlan = (
  plan: Plan,
  focus: TrainingFocus,
  drills: DrillIndex,
): PracticeSession => {
  const sessionDrills: PracticeSessionDrill[] = plan.drills.map((entry) => {
    const drill = drills[entry.id];
    return {
      id: entry.id,
      reps: entry.reps,
      durationMin: entry.durationMin,
      title: drill?.title,
      estTimeMin: drill?.estTimeMin,
      focus: drill?.focus ?? focus,
    };
  });
  return {
    planId: plan.id,
    focus,
    startedAt: Date.now(),
    drills: sessionDrills,
  };
};
