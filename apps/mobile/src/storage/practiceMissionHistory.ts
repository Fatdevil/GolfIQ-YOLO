import { getItem, setItem } from '@app/storage/asyncStorage';

export type PracticeMissionSession = {
  id: string;
  recommendationId: string;
  startedAt: string;
  completedAt?: string;
  targetSampleCount?: number;
  totalShots: number;
  targetClubs: string[];
  completed: boolean;
};

export type PracticeProgressOverview = {
  totalSessions: number;
  completedSessions: number;
  windowDays: number;
  lastCompleted?: PracticeMissionSession;
  lastStarted?: PracticeMissionSession;
};

export const PRACTICE_MISSION_HISTORY_KEY = 'practiceMissionHistory:v1';
export const PRACTICE_MISSION_WINDOW_DAYS = 7;

function parseHistory(raw: string | null): PracticeMissionSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PracticeMissionSession =>
      Boolean(entry && typeof entry.id === 'string' && typeof entry.recommendationId === 'string'),
    );
  } catch (err) {
    console.warn('[practiceHistory] Failed to parse mission history', err);
    return [];
  }
}

export async function loadPracticeMissionHistory(): Promise<PracticeMissionSession[]> {
  const raw = await getItem(PRACTICE_MISSION_HISTORY_KEY);
  return parseHistory(raw);
}

export async function appendPracticeMissionSession(session: PracticeMissionSession): Promise<void> {
  const history = await loadPracticeMissionHistory();
  const next = [...history, session];
  try {
    await setItem(PRACTICE_MISSION_HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[practiceHistory] Failed to persist mission session', err);
  }
}

function getEventTime(session: PracticeMissionSession): number {
  const completedAt = session.completedAt ? new Date(session.completedAt).getTime() : NaN;
  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : NaN;
  if (!Number.isNaN(completedAt)) return completedAt;
  if (!Number.isNaN(startedAt)) return startedAt;
  return NaN;
}

export function summarizeRecentPracticeHistory(
  history: PracticeMissionSession[],
  now: Date,
): PracticeProgressOverview {
  const windowMs = PRACTICE_MISSION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = now.getTime();
  const recent = history.filter((session) => {
    const eventTime = getEventTime(session);
    if (Number.isNaN(eventTime)) return false;
    return nowMs - eventTime <= windowMs;
  });

  const completedSessions = recent.filter((session) => session.completed);

  const byCompleted = [...completedSessions].sort((a, b) => getEventTime(b) - getEventTime(a));
  const byStarted = [...recent].sort((a, b) => getEventTime(b) - getEventTime(a));

  return {
    totalSessions: recent.length,
    completedSessions: completedSessions.length,
    windowDays: PRACTICE_MISSION_WINDOW_DAYS,
    lastCompleted: byCompleted[0],
    lastStarted: byStarted[0],
  };
}
