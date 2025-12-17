export type PracticeSessionResultContext = {
  recommendationId?: string;
  strokesGainedLightFocusCategory?: string;
  source?: string;
};

export type PracticeSessionResult = {
  missionId: string;
  completedAt: string;
  shotsAttempted: number;
  successRate?: number;
  durationSec?: number;
  context?: PracticeSessionResultContext;
};

export const MAX_PRACTICE_SESSION_RESULTS = 50;

function isFiniteDate(value?: string): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > 0 && time < 9999999999999;
}

function normalizeMissionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeShots(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.max(0, Math.round(value));
  return rounded;
}

function normalizeRatio(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  if (value > 1) return 1;
  return Number(value);
}

function normalizeDuration(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function normalizeContext(value: unknown): PracticeSessionResultContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const recommendationId = normalizeMissionId((value as any).recommendationId);
  const sgLight = normalizeMissionId((value as any).strokesGainedLightFocusCategory);
  const source = normalizeMissionId((value as any).source);

  const context: PracticeSessionResultContext = {};
  if (recommendationId) context.recommendationId = recommendationId;
  if (sgLight) context.strokesGainedLightFocusCategory = sgLight;
  if (source) context.source = source;

  return Object.keys(context).length ? context : undefined;
}

export function normalizePracticeSessionResult(raw: unknown): PracticeSessionResult | null {
  if (!raw || typeof raw !== 'object') return null;

  const missionId = normalizeMissionId((raw as any).missionId);
  const completedAt = (raw as any).completedAt;
  const shotsAttempted = normalizeShots((raw as any).shotsAttempted);

  if (!missionId || !isFiniteDate(completedAt) || shotsAttempted == null) {
    return null;
  }

  const normalized: PracticeSessionResult = {
    missionId,
    completedAt: new Date(completedAt).toISOString(),
    shotsAttempted,
  };

  const successRate = normalizeRatio((raw as any).successRate);
  if (successRate !== undefined) normalized.successRate = successRate;

  const durationSec = normalizeDuration((raw as any).durationSec);
  if (durationSec !== undefined) normalized.durationSec = durationSec;

  const context = normalizeContext((raw as any).context);
  if (context) normalized.context = context;

  return normalized;
}

export function normalizePracticeSessionResults(raw: unknown): PracticeSessionResult[] {
  if (!Array.isArray(raw)) return [];
  const normalized: PracticeSessionResult[] = [];
  raw.forEach((candidate) => {
    const result = normalizePracticeSessionResult(candidate);
    if (result) normalized.push(result);
  });
  return clampPracticeSessionResults(normalized);
}

function sortByCompletedAt(a: PracticeSessionResult, b: PracticeSessionResult): number {
  return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
}

export function clampPracticeSessionResults(
  results: PracticeSessionResult[],
  limit = MAX_PRACTICE_SESSION_RESULTS,
): PracticeSessionResult[] {
  const sorted = [...results].sort(sortByCompletedAt);
  if (sorted.length <= limit) return sorted;
  return sorted.slice(sorted.length - limit);
}

export function appendPracticeSessionResult(
  history: PracticeSessionResult[],
  next: PracticeSessionResult,
  limit = MAX_PRACTICE_SESSION_RESULTS,
): PracticeSessionResult[] {
  const normalized = normalizePracticeSessionResult(next);
  if (!normalized) return history;
  const merged = clampPracticeSessionResults([...history, normalized], limit);
  return merged;
}

function normalizeDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export type PracticeSessionProgress = {
  totalSessions: number;
  consecutiveDays: number;
  lastCompletedAt?: string;
  lastSevenDays: number;
  lastFourteenDays: number;
};

export function computePracticeSessionProgress(
  results: PracticeSessionResult[],
  now: Date,
): PracticeSessionProgress {
  const days = new Map<string, PracticeSessionResult[]>();
  const nowDay = normalizeDay(now.toISOString());

  results.forEach((result) => {
    const day = normalizeDay(result.completedAt);
    if (!day) return;
    const entries = days.get(day) ?? [];
    entries.push(result);
    days.set(day, entries);
  });

  const sortedDays = Array.from(days.keys()).sort();
  let consecutiveDays = 0;
  let cursor: string | null = nowDay ?? null;

  if (cursor) {
    for (let i = sortedDays.length - 1; i >= 0; i -= 1) {
      const day = sortedDays[i];
      const currentCursor: string | null = cursor;
      if (!currentCursor) break;
      if (day === currentCursor) {
        consecutiveDays += 1;
        const nextDate: Date = new Date(currentCursor);
        nextDate.setDate(nextDate.getDate() - 1);
        cursor = nextDate.toISOString();
      } else if (new Date(day).getTime() < new Date(currentCursor).getTime()) {
        break;
      }
    }
  }

  const clampedResults = results.length ? clampPracticeSessionResults(results) : [];
  const lastCompletedAt = clampedResults.length
    ? clampedResults[clampedResults.length - 1]?.completedAt
    : undefined;
  const nowMs = now.getTime();
  const sevenMs = 7 * 24 * 60 * 60 * 1000;
  const fourteenMs = 14 * 24 * 60 * 60 * 1000;
  let lastSevenDays = 0;
  let lastFourteenDays = 0;

  results.forEach((result) => {
    const completedMs = new Date(result.completedAt).getTime();
    if (Number.isNaN(completedMs)) return;
    if (completedMs >= nowMs - sevenMs) lastSevenDays += 1;
    if (completedMs >= nowMs - fourteenMs) lastFourteenDays += 1;
  });

  return {
    totalSessions: results.length,
    consecutiveDays,
    lastCompletedAt,
    lastSevenDays,
    lastFourteenDays,
  };
}
