import { getItem, setItem } from '@app/storage/asyncStorage';

export type PracticeSession = {
  id: string;
  weekStartISO: string;
  startedAt: string;
  endedAt?: string;
  drillIds: string[];
  completedDrillIds: string[];
  skippedDrillIds: string[];
};

const LAST_SESSION_KEY = 'golfiq.practice.lastSession.v1';
const SESSIONS_KEY = 'golfiq.practice.sessions.v1';
const MAX_SESSIONS = 20;

function isIsoString(value: any): value is string {
  return typeof value === 'string';
}

function isPracticeSession(value: any): value is PracticeSession {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.weekStartISO === 'string' &&
    isIsoString(value.startedAt) &&
    (value.endedAt === undefined || isIsoString(value.endedAt)) &&
    Array.isArray(value.drillIds) &&
    value.drillIds.every((id: any) => typeof id === 'string') &&
    Array.isArray(value.completedDrillIds) &&
    value.completedDrillIds.every((id: any) => typeof id === 'string') &&
    Array.isArray(value.skippedDrillIds) &&
    value.skippedDrillIds.every((id: any) => typeof id === 'string')
  );
}

export async function loadLastPracticeSession(): Promise<PracticeSession | null> {
  const raw = await getItem(LAST_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (isPracticeSession(parsed)) return parsed;
  } catch (err) {
    console.warn('[practice-session] Failed to parse last session', err);
  }
  return null;
}

export async function savePracticeSession(session: PracticeSession): Promise<void> {
  try {
    await setItem(LAST_SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('[practice-session] Failed to save last session', err);
  }

  try {
    const rawList = await getItem(SESSIONS_KEY);
    const parsed = rawList ? JSON.parse(rawList) : [];
    const list: PracticeSession[] = Array.isArray(parsed)
      ? parsed.filter(isPracticeSession)
      : [];
    const nextList = [session, ...list.filter((item) => item.id !== session.id)].slice(0, MAX_SESSIONS);
    await setItem(SESSIONS_KEY, JSON.stringify(nextList));
  } catch (err) {
    console.warn('[practice-session] Failed to append session', err);
  }
}
