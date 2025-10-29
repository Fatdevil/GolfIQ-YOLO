import type { PlayerProfile } from '../coach/profile';
import { rankFocus } from '../coach/policy';
import type { Drill, Plan, TrainingFocus } from './types';

export type PracticeSessionDrill = {
  id: string;
  reps?: number;
  durationMin?: number;
  title?: string;
  estTimeMin?: number;
  focus?: TrainingFocus;
};

export type ScheduledPracticeSession = {
  id: string;
  planId: string;
  focus: TrainingFocus;
  scheduledAt: number;
  weekId: string;
  sequence: number;
  drills: PracticeSessionDrill[];
};

export type SchedulePreset = '2x/week' | 'custom' | string | undefined;

export interface SessionSchedulerOptions {
  referenceDate?: Date;
  weeks?: number;
  sessionHour?: number;
  customOffsets?: number[];
}

export interface PlanRecommendation {
  focus: TrainingFocus;
  plan: Plan | null;
}

type DrillIndex = Record<string, Drill>;

const DEFAULT_WEEKLY_OFFSETS = [1, 4];
const DEFAULT_SESSION_HOUR = 18;

const clampWeekCount = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  if (value > 4) {
    return 4;
  }
  return Math.floor(value);
};

const startOfWeek = (date: Date): Date => {
  const result = new Date(date.getTime());
  result.setHours(0, 0, 0, 0);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const isoWeekId = (date: Date): string => {
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  temp.setDate(temp.getDate() + 3 - ((temp.getDay() + 6) % 7));
  const week1 = new Date(temp.getFullYear(), 0, 4);
  const diff = temp.getTime() - week1.getTime();
  const week = 1 + Math.round((diff / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${temp.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const normaliseSchedule = (schedule: SchedulePreset): SchedulePreset => {
  if (!schedule) {
    return undefined;
  }
  const token = schedule.trim().toLowerCase();
  if (!token) {
    return undefined;
  }
  if (token === '2x/week') {
    return '2x/week';
  }
  if (token === 'custom') {
    return 'custom';
  }
  return token;
};

const buildDrillPayload = (plan: Plan, drills: DrillIndex, focus: TrainingFocus): PracticeSessionDrill[] =>
  plan.drills.map((entry) => {
    const drill = drills[entry.id];
    return {
      id: entry.id,
      reps: entry.reps,
      durationMin: entry.durationMin,
      title: drill?.title,
      estTimeMin: drill?.estTimeMin,
      focus: drill?.focus ?? focus,
    } satisfies PracticeSessionDrill;
  });

const resolveOffsets = (schedule: SchedulePreset, overrides?: number[]): number[] => {
  if (Array.isArray(overrides) && overrides.length) {
    return overrides
      .map((value) => Math.max(0, Math.floor(value)))
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a - b);
  }
  if (schedule === '2x/week') {
    return [...DEFAULT_WEEKLY_OFFSETS];
  }
  return [1];
};

const resolveWeekHorizon = (schedule: SchedulePreset, weeks?: number): number => {
  if (typeof weeks === 'number' && Number.isFinite(weeks)) {
    return clampWeekCount(weeks);
  }
  if (schedule === '2x/week') {
    return 2;
  }
  return 1;
};

const resolveSessionHour = (hour?: number): number => {
  if (typeof hour !== 'number' || !Number.isFinite(hour)) {
    return DEFAULT_SESSION_HOUR;
  }
  if (hour < 0) {
    return 0;
  }
  if (hour > 23) {
    return 23;
  }
  return Math.floor(hour);
};

export const generatePlanSessions = (
  plan: Plan,
  focus: TrainingFocus,
  drills: DrillIndex,
  options?: SessionSchedulerOptions,
): ScheduledPracticeSession[] => {
  const reference = options?.referenceDate ?? new Date();
  const schedule = normaliseSchedule(plan.schedule);
  const offsets = resolveOffsets(schedule, options?.customOffsets);
  const weekHorizon = resolveWeekHorizon(schedule, options?.weeks);
  const sessionHour = resolveSessionHour(options?.sessionHour);

  const weekStart = startOfWeek(reference);
  const sessions: ScheduledPracticeSession[] = [];
  const drillPayload = buildDrillPayload(plan, drills, focus);

  for (let weekIndex = 0; weekIndex < weekHorizon; weekIndex += 1) {
    const currentWeek = new Date(weekStart.getTime());
    currentWeek.setDate(currentWeek.getDate() + weekIndex * 7);
    const weekKey = isoWeekId(currentWeek);

    offsets.forEach((offset, offsetIndex) => {
      const scheduled = new Date(currentWeek.getTime());
      scheduled.setDate(scheduled.getDate() + offset);
      scheduled.setHours(sessionHour, 0, 0, 0);
      const sequence = weekIndex * offsets.length + offsetIndex;
      sessions.push({
        id: `${plan.id}:${weekKey}:${String(sequence).padStart(2, '0')}`,
        planId: plan.id,
        focus,
        scheduledAt: scheduled.getTime(),
        weekId: weekKey,
        sequence,
        drills: drillPayload,
      });
    });
  }

  return sessions.sort((a, b) => a.scheduledAt - b.scheduledAt);
};

export function recommendFocus(
  profile: PlayerProfile | null | undefined,
  fallback: TrainingFocus,
): TrainingFocus {
  if (!profile) {
    return fallback;
  }
  const ranked = rankFocus(profile);
  if (!ranked.length) {
    return fallback;
  }
  return ranked[0].focus;
}

export function recommendPlan(
  plansByFocus: Partial<Record<TrainingFocus, Plan[]>>,
  profile: PlayerProfile | null | undefined,
  fallback: TrainingFocus,
): PlanRecommendation {
  const focus = recommendFocus(profile, fallback);
  const plans = plansByFocus[focus] ?? [];
  return { focus, plan: plans.length ? plans[0] : null };
}

export const __private__ = {
  startOfWeek,
  isoWeekId,
  resolveOffsets,
  resolveWeekHorizon,
  resolveSessionHour,
};
