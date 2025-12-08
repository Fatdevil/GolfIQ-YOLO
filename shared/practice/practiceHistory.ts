export type PracticeMissionStatus = 'completed' | 'abandoned';

export type PracticeMissionHistoryEntry = {
  id: string;
  missionId: string;
  startedAt: string;
  endedAt?: string;
  status: PracticeMissionStatus;
  targetClubs: string[];
  targetSampleCount?: number;
  completedSampleCount: number;
};

export type PracticeMissionOutcome = {
  missionId: string;
  sessionId?: string;
  startedAt: string;
  endedAt?: string;
  targetClubs: string[];
  targetSampleCount?: number;
  completedSampleCount: number;
};

export type MissionStreak = {
  consecutiveDays: number;
  lastCompletedAt?: string;
};

export type PracticeHistoryListStatus = 'completed' | 'partial' | 'incomplete';

export type PracticeHistoryListItem = {
  id: string;
  missionId: string;
  day: string;
  occurredAt: string;
  targetClubsLabel: string;
  targetSampleCount?: number;
  completedSampleCount: number;
  status: PracticeHistoryListStatus;
  countsTowardStreak: boolean;
};

export type CompletionSummary = {
  completed: number;
  attempted: number;
};

export type PracticeMissionDetail = {
  id: string;
  missionId: string;
  startedAt: Date;
  endedAt: Date | null;
  missionKind: 'recommended' | 'custom' | 'other';
  targetClubs: Array<{ id: string; label: string }>;
  targetSampleCount: number | null;
  completedSampleCount: number;
  completionRatio: number | null;
  countedTowardStreak: boolean;
  originSuggestionId?: string | null;
};

export const MAX_PRACTICE_HISTORY_ENTRIES = 100;
export const DEFAULT_HISTORY_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function isFiniteDate(value?: string): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > 0 && time < 9999999999999;
}

function entryTimestamp(entry: PracticeMissionHistoryEntry): number {
  const candidates = [entry.endedAt, entry.startedAt];
  for (const candidate of candidates) {
    if (isFiniteDate(candidate)) return new Date(candidate!).getTime();
  }
  return Number.NaN;
}

function normalizeDay(value: Date): string {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized.toISOString();
}

function normalizeMissionId(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  return null;
}

function inferMissionKind(missionId: string): PracticeMissionDetail['missionKind'] {
  if (/^(practice_|practice|rec-|recommendation)/.test(missionId)) return 'recommended';
  if (/^(custom|user)/.test(missionId)) return 'custom';
  return 'other';
}

function normalizeTargetClubs(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((club): club is string => typeof club === 'string' && club.trim().length > 0);
  }
  return [];
}

function formatTargetClubs(clubs: string[], labels?: Record<string, string>): string {
  if (!clubs.length) return '';
  return clubs
    .map((club) => labels?.[club] ?? club)
    .filter((club) => club.trim().length > 0)
    .join(', ');
}

function mapTargetClubs(clubs: string[], labels?: Record<string, string>): Array<{ id: string; label: string }> {
  return clubs.map((club) => ({ id: club, label: labels?.[club] ?? club }));
}

function coerceSampleCount(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  return undefined;
}

function deriveStatus(entry: Partial<PracticeMissionHistoryEntry>): PracticeMissionStatus {
  if ('status' in entry && (entry as PracticeMissionHistoryEntry).status) {
    const status = (entry as PracticeMissionHistoryEntry).status;
    if (status === 'completed' || status === 'abandoned') return status;
  }
  if ('completed' in entry && typeof (entry as any).completed === 'boolean') {
    return (entry as any).completed ? 'completed' : 'abandoned';
  }
  if (
    typeof entry.completedSampleCount === 'number' &&
    typeof entry.targetSampleCount === 'number' &&
    entry.completedSampleCount >= entry.targetSampleCount
  ) {
    return 'completed';
  }
  return 'abandoned';
}

function createEntryId(missionId: string, startedAt?: string, endedAt?: string): string {
  const timestamp = startedAt ?? endedAt ?? new Date().toISOString();
  return `${missionId}:${timestamp}:${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizePracticeHistoryEntries(raw: unknown): PracticeMissionHistoryEntry[] {
  if (!Array.isArray(raw)) return [];

  const normalized: PracticeMissionHistoryEntry[] = [];

  for (const candidate of raw) {
    if (!candidate || typeof candidate !== 'object') continue;

    const missionId = normalizeMissionId((candidate as any).missionId ?? (candidate as any).recommendationId);
    if (!missionId) continue;

    const startedAt: string | undefined = (candidate as any).startedAt;
    const endedAt: string | undefined = (candidate as any).endedAt ?? (candidate as any).completedAt;
    const targetSampleCount = coerceSampleCount((candidate as any).targetSampleCount);
    const completedSampleCount = coerceSampleCount((candidate as any).completedSampleCount ?? (candidate as any).totalShots) ?? 0;
    const targetClubs = normalizeTargetClubs((candidate as any).targetClubs);

    if (!isFiniteDate(startedAt) && !isFiniteDate(endedAt)) continue;
    if (completedSampleCount <= 0) continue;

    const status = deriveStatus({
      ...(candidate as any),
      targetSampleCount,
      completedSampleCount,
    });

    const id: string =
      typeof (candidate as any).id === 'string' && (candidate as any).id.trim().length > 0
        ? (candidate as any).id
        : `${missionId}:${startedAt ?? endedAt}`;

    normalized.push({
      id,
      missionId,
      startedAt: startedAt ?? endedAt!,
      endedAt,
      status,
      targetClubs,
      targetSampleCount,
      completedSampleCount,
    });
  }

  return normalized
    .filter((entry) => !Number.isNaN(entryTimestamp(entry)))
    .sort((a, b) => entryTimestamp(a) - entryTimestamp(b));
}

export function recordMissionOutcome(
  previousState: PracticeMissionHistoryEntry[],
  outcome: PracticeMissionOutcome,
): PracticeMissionHistoryEntry[] {
  const missionId = normalizeMissionId(outcome.missionId);
  const targetClubs = normalizeTargetClubs(outcome.targetClubs);
  const completedSampleCount = coerceSampleCount(outcome.completedSampleCount);

  if (!missionId || targetClubs.length === 0 || !completedSampleCount || completedSampleCount <= 0) {
    return previousState;
  }

  const startedAt = isFiniteDate(outcome.startedAt) ? outcome.startedAt : undefined;
  const endedAt = isFiniteDate(outcome.endedAt) ? outcome.endedAt : undefined;
  if (!startedAt && !endedAt) return previousState;

  const targetSampleCount = coerceSampleCount(outcome.targetSampleCount);
  const status: PracticeMissionStatus =
    targetSampleCount != null && completedSampleCount < targetSampleCount ? 'abandoned' : 'completed';

  const id = outcome.sessionId ?? createEntryId(missionId, startedAt, endedAt);

  const nextEntry: PracticeMissionHistoryEntry = {
    id: id ?? createEntryId(missionId, startedAt, endedAt),
    missionId,
    startedAt: startedAt ?? endedAt!,
    endedAt,
    status,
    targetClubs,
    targetSampleCount: targetSampleCount ?? undefined,
    completedSampleCount,
  };

  const next = [...previousState, nextEntry];
  if (next.length > MAX_PRACTICE_HISTORY_ENTRIES) {
    return next.slice(next.length - MAX_PRACTICE_HISTORY_ENTRIES);
  }
  return next;
}

export function selectRecentMissions(
  state: PracticeMissionHistoryEntry[],
  options: { limit?: number; daysBack?: number },
  now: Date = new Date(),
): PracticeMissionHistoryEntry[] {
  const { limit = MAX_PRACTICE_HISTORY_ENTRIES, daysBack = DEFAULT_HISTORY_WINDOW_DAYS } = options;
  const nowMs = now.getTime();
  const windowMs = daysBack * 24 * 60 * 60 * 1000;

  const filtered = state
    .filter((entry) => {
      const ts = entryTimestamp(entry);
      if (Number.isNaN(ts)) return false;
      return nowMs - ts <= windowMs;
    })
    .sort((a, b) => entryTimestamp(b) - entryTimestamp(a));

  return filtered.slice(0, limit);
}

export function computeMissionStreak(
  state: PracticeMissionHistoryEntry[],
  missionId: string,
  now: Date = new Date(),
): MissionStreak {
  const missionEntries = state
    .filter((entry) => entry.missionId === missionId && entry.status === 'completed')
    .sort((a, b) => entryTimestamp(b) - entryTimestamp(a));

  if (missionEntries.length === 0) return { consecutiveDays: 0 };

  const days = new Set<number>();
  for (const entry of missionEntries) {
    const ts = entryTimestamp(entry);
    if (Number.isNaN(ts)) continue;
    const day = Math.floor(ts / DAY_MS);
    days.add(day);
  }

  const lastCompletedAt = missionEntries[0].endedAt ?? missionEntries[0].startedAt;
  const anchorTimestamp = missionEntries[0].endedAt
    ? new Date(missionEntries[0].endedAt).getTime()
    : missionEntries[0].startedAt
      ? new Date(missionEntries[0].startedAt).getTime()
      : now.getTime();
  const anchorDay = Math.floor(anchorTimestamp / DAY_MS);

  const todayDay = Math.floor(now.getTime() / DAY_MS);
  if (todayDay - anchorDay > 1) {
    return { consecutiveDays: 0, lastCompletedAt };
  }

  let streak = 0;
  let currentDay = anchorDay;
  while (days.has(currentDay)) {
    streak += 1;
    currentDay -= 1;
  }

  return { consecutiveDays: streak, lastCompletedAt };
}

export function computeRecentCompletionSummary(
  state: PracticeMissionHistoryEntry[],
  windowDays: number = DEFAULT_HISTORY_WINDOW_DAYS,
  now: Date = new Date(),
): CompletionSummary {
  const recent = selectRecentMissions(state, { daysBack: windowDays, limit: MAX_PRACTICE_HISTORY_ENTRIES }, now);
  const completed = recent.filter((entry) => entry.status === 'completed').length;
  return { completed, attempted: recent.length };
}

function buildStreakDaySet(state: PracticeMissionHistoryEntry[], missionId: string, now: Date): Set<number> {
  const streak = computeMissionStreak(state, missionId, now);
  if (!streak.lastCompletedAt || streak.consecutiveDays <= 0) return new Set();

  const anchor = new Date(streak.lastCompletedAt);
  if (Number.isNaN(anchor.getTime())) return new Set();

  const anchorDay = Math.floor(anchor.getTime() / DAY_MS);
  const days = new Set<number>();
  for (let i = 0; i < streak.consecutiveDays; i += 1) {
    days.add(anchorDay - i);
  }
  return days;
}

export function buildPracticeHistoryList(
  state: PracticeMissionHistoryEntry[],
  options: { limit?: number; daysBack?: number; clubLabels?: Record<string, string>; now?: Date } = {},
): PracticeHistoryListItem[] {
  const { limit = 20, daysBack = DEFAULT_HISTORY_WINDOW_DAYS, clubLabels, now = new Date() } = options;
  const recent = selectRecentMissions(state, { daysBack, limit }, now);

  const streakDaysByMission = new Map<string, Set<number>>();
  for (const entry of recent) {
    if (!streakDaysByMission.has(entry.missionId)) {
      streakDaysByMission.set(entry.missionId, buildStreakDaySet(state, entry.missionId, now));
    }
  }

  return recent.map((entry) => {
    const occurredAt = entry.endedAt ?? entry.startedAt;
    const occurredDate = occurredAt ? new Date(occurredAt) : new Date();
    const day = normalizeDay(occurredDate);
    const completedSamples = entry.completedSampleCount ?? 0;
    const targetSamples = entry.targetSampleCount;

    let status: PracticeHistoryListStatus = 'incomplete';
    if (completedSamples > 0) {
      if (entry.status === 'completed' || (typeof targetSamples === 'number' && completedSamples >= targetSamples)) {
        status = 'completed';
      } else {
        status = 'partial';
      }
    }

    const streakDays = streakDaysByMission.get(entry.missionId);
    const countsTowardStreak =
      status === 'completed' && streakDays?.has(Math.floor(occurredDate.getTime() / DAY_MS)) === true;

    return {
      id: entry.id,
      missionId: entry.missionId,
      day,
      occurredAt: occurredAt ?? day,
      targetClubsLabel: formatTargetClubs(entry.targetClubs, clubLabels),
      targetSampleCount: targetSamples,
      completedSampleCount: completedSamples,
      status,
      countsTowardStreak,
    };
  });
}

function computeEntryStatus(entry: PracticeMissionHistoryEntry): PracticeHistoryListStatus {
  const completedSamples = entry.completedSampleCount ?? 0;
  const targetSamples = entry.targetSampleCount;

  if (completedSamples <= 0) return 'incomplete';
  if (entry.status === 'completed' || (typeof targetSamples === 'number' && completedSamples >= targetSamples)) {
    return 'completed';
  }
  return 'partial';
}

export function buildPracticeMissionDetail(
  state: PracticeMissionHistoryEntry[],
  id: string,
  options: { clubLabels?: Record<string, string>; now?: Date } = {},
): PracticeMissionDetail | null {
  const { clubLabels, now = new Date() } = options;
  const entry = state.find((candidate) => candidate.id === id);
  if (!entry) return null;

  const occurredAt = entry.endedAt ?? entry.startedAt;
  const occurredDate = occurredAt ? new Date(occurredAt) : now;
  const status = computeEntryStatus(entry);

  const streakDays = buildStreakDaySet(state, entry.missionId, now);
  const countsTowardStreak = status === 'completed' && streakDays.has(Math.floor(occurredDate.getTime() / DAY_MS));

  const targetSampleCount = typeof entry.targetSampleCount === 'number' ? entry.targetSampleCount : null;
  const completionRatio = targetSampleCount && targetSampleCount > 0 ? entry.completedSampleCount / targetSampleCount : null;

  return {
    id: entry.id,
    missionId: entry.missionId,
    startedAt: entry.startedAt ? new Date(entry.startedAt) : occurredDate,
    endedAt: entry.endedAt ? new Date(entry.endedAt) : null,
    missionKind: inferMissionKind(entry.missionId),
    targetClubs: mapTargetClubs(entry.targetClubs, clubLabels),
    targetSampleCount,
    completedSampleCount: entry.completedSampleCount ?? 0,
    completionRatio,
    countedTowardStreak: countsTowardStreak,
    originSuggestionId: entry.missionId || null,
  };
}
