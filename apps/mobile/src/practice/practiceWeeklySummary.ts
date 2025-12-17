import { getPracticeSessionDurationMinutes, getPracticeStreakDays } from './practiceInsights';
import { getWeekStart } from './practicePlanStorage';
import type { PracticePlan } from './practicePlanStorage';
import type { PracticeSession } from './practiceSessionStorage';

export type PracticeWeeklySummary = {
  weekStartISO: string;
  weekEndISO: string;
  sessionsCount: number;
  minutesTotal: number | null;
  drillsCompleted: number;
  streakDays: number;
  recommendedDrillsCompleted?: number;
  hasPlan: boolean;
  planCompletionPct?: number;
};

function addDays(date: Date, delta: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isSessionInWindow(session: PracticeSession, start: Date, end: Date): boolean {
  const endedAt = parseDate(session.endedAt);
  if (!endedAt) return false;
  return endedAt >= start && endedAt < end;
}

export function buildPracticeWeeklySummary(
  sessions: PracticeSession[],
  plan: PracticePlan | null,
  now: Date = new Date(),
): PracticeWeeklySummary {
  const weekStart = getWeekStart(now);
  const weekEnd = addDays(weekStart, 7);

  const weekSessions = sessions.filter((session) => isSessionInWindow(session, weekStart, weekEnd));

  let minutesTotal = 0;
  let hasMissingMinutes = false;
  const drillsCompleted = weekSessions.reduce((sum, session) => {
    const minutes = getPracticeSessionDurationMinutes(session);
    if (minutes === null) {
      hasMissingMinutes = true;
    } else {
      minutesTotal += minutes;
    }
    const completed = Array.isArray(session.completedDrillIds) ? session.completedDrillIds.length : 0;
    return sum + completed;
  }, 0);

  const sessionsCount = weekSessions.length;
  const streakDays = getPracticeStreakDays(sessions, now);

  const hasPlan = Boolean(plan && plan.weekStartISO === weekStart.toISOString() && plan.items?.length);
  const planCompletionPct = hasPlan && plan?.items?.length
    ? plan.items.filter((item) => item.status === 'done' || (item as any).completedAt).length / plan.items.length
    : undefined;

  return {
    weekStartISO: weekStart.toISOString(),
    weekEndISO: weekEnd.toISOString(),
    sessionsCount,
    minutesTotal: hasMissingMinutes || sessionsCount === 0 ? null : minutesTotal,
    drillsCompleted,
    streakDays,
    hasPlan,
    planCompletionPct,
  };
}
