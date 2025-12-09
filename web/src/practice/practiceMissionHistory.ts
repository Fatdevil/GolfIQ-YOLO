import {
  DEFAULT_HISTORY_WINDOW_DAYS,
  computeMissionStreak,
  computeRecentCompletionSummary,
  normalizePracticeHistoryEntries,
  recordMissionOutcome,
} from "@shared/practice/practiceHistory";
import { trackPracticeMissionComplete } from "@/practice/analytics";
import type {
  PracticeMissionHistoryEntry,
  PracticeMissionOutcome,
} from "@shared/practice/practiceHistory";

export type PracticeProgressOverview = {
  totalSessions: number;
  completedSessions: number;
  windowDays: number;
  lastCompleted?: PracticeMissionHistoryEntry;
  lastStarted?: PracticeMissionHistoryEntry;
  streakDays?: number;
};

export const PRACTICE_MISSION_HISTORY_KEY = "practiceMissionHistory:v1";
export const PRACTICE_MISSION_WINDOW_DAYS = DEFAULT_HISTORY_WINDOW_DAYS;

function parseHistory(raw: string | null): PracticeMissionHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizePracticeHistoryEntries(parsed);
  } catch (err) {
    console.warn("[practiceHistory] Failed to parse mission history", err);
    return [];
  }
}

export async function loadPracticeMissionHistory(): Promise<PracticeMissionHistoryEntry[]> {
  try {
    const raw = window.localStorage.getItem(PRACTICE_MISSION_HISTORY_KEY);
    return parseHistory(raw);
  } catch (err) {
    console.warn("[practiceHistory] Failed to load mission history", err);
    return [];
  }
}

async function persistHistory(history: PracticeMissionHistoryEntry[]): Promise<void> {
  try {
    window.localStorage.setItem(PRACTICE_MISSION_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn("[practiceHistory] Failed to persist mission session", err);
  }
}

export async function recordPracticeMissionOutcome(
  outcome: PracticeMissionOutcome,
): Promise<PracticeMissionHistoryEntry[]> {
  const history = await loadPracticeMissionHistory();
  const next = recordMissionOutcome(history, outcome);
  if (next !== history) {
    await persistHistory(next);
    trackPracticeMissionComplete({
      missionId: outcome.missionId,
      samplesCount: outcome.completedSampleCount ?? null,
    });
  }
  return next;
}

function getEventTime(session: PracticeMissionHistoryEntry): number {
  const completedAt = session.endedAt ? new Date(session.endedAt).getTime() : NaN;
  const startedAt = session.startedAt ? new Date(session.startedAt).getTime() : NaN;
  if (!Number.isNaN(completedAt)) return completedAt;
  if (!Number.isNaN(startedAt)) return startedAt;
  return NaN;
}

export function summarizeRecentPracticeHistory(
  history: PracticeMissionHistoryEntry[],
  now: Date,
): PracticeProgressOverview {
  const summary = computeRecentCompletionSummary(history, PRACTICE_MISSION_WINDOW_DAYS, now);
  const lastCompleted = [...history]
    .filter((entry) => entry.endedAt || entry.startedAt)
    .filter((entry) => entry.status === "completed")
    .sort((a, b) => getEventTime(b) - getEventTime(a))[0];
  const lastStarted = [...history].sort((a, b) => getEventTime(b) - getEventTime(a))[0];

  const lastMissionId = lastCompleted?.missionId ?? lastStarted?.missionId;
  const streak = lastMissionId ? computeMissionStreak(history, lastMissionId, now) : { consecutiveDays: 0 };

  return {
    totalSessions: summary.attempted,
    completedSessions: summary.completed,
    windowDays: PRACTICE_MISSION_WINDOW_DAYS,
    lastCompleted,
    lastStarted,
    streakDays: streak.consecutiveDays,
  };
}

export function clearPracticeHistoryForTests(): void {
  try {
    window.localStorage.removeItem(PRACTICE_MISSION_HISTORY_KEY);
  } catch {
    // ignore
  }
}
