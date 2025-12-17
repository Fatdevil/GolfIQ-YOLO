import { getWeekStart } from './practicePlanStorage';
import type { PracticeSession } from './practiceSessionStorage';

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isCompletedSession(session: PracticeSession): boolean {
  if (!session.endedAt) return false;
  const ended = new Date(session.endedAt);
  return !Number.isNaN(ended.getTime());
}

export function getPracticeSessionDurationMinutes(session: PracticeSession): number | null {
  if (!session.startedAt || !session.endedAt) return null;
  const start = new Date(session.startedAt);
  const end = new Date(session.endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return null;
  return Math.max(1, Math.round(diff / 60000));
}

function getSessionDayKey(session: PracticeSession): string | null {
  if (!isCompletedSession(session)) return null;
  const ended = new Date(session.endedAt!);
  return toLocalDateKey(ended);
}

function addDays(base: Date, delta: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

export function getPracticeStreakDays(sessions: PracticeSession[], nowDate = new Date()): number {
  const days = new Set(
    sessions
      .map(getSessionDayKey)
      .filter((value): value is string => Boolean(value)),
  );

  const todayKey = toLocalDateKey(nowDate);
  const yesterdayKey = toLocalDateKey(addDays(nowDate, -1));

  let currentKey: string | null = null;
  if (days.has(todayKey)) {
    currentKey = todayKey;
  } else if (days.has(yesterdayKey)) {
    currentKey = yesterdayKey;
  }

  if (!currentKey) return 0;

  let streak = 0;
  let cursor = currentKey === todayKey ? new Date(nowDate) : addDays(nowDate, -1);
  while (days.has(toLocalDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export function getThisWeekTotals(
  sessions: PracticeSession[],
  nowDate = new Date(),
): { sessionCount: number; minutes: number } {
  const weekStart = getWeekStart(nowDate);
  const weekEnd = addDays(weekStart, 7);

  return sessions
    .filter(isCompletedSession)
    .filter((session) => {
      const ended = new Date(session.endedAt!);
      return ended >= weekStart && ended < weekEnd;
    })
    .reduce(
      (acc, session) => {
        const minutes = getPracticeSessionDurationMinutes(session) ?? 0;
        return {
          sessionCount: acc.sessionCount + 1,
          minutes: acc.minutes + minutes,
        };
      },
      { sessionCount: 0, minutes: 0 },
    );
}
